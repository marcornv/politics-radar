"use client";

import { useActionState, useState } from "react";
import { acaoCompativel, type EstadoChave } from "@/app/configuracoes/actions";
import { TOM } from "./ChaveForm";

const CAMPO =
  "w-full rounded-md border border-line bg-bg px-3 py-2 font-mono text-[13px] text-ink placeholder:font-sans placeholder:text-muted disabled:opacity-50";

/** Base URL + model + optional key for any server that speaks the OpenAI Chat Completions API. */
export function CompativelForm({
  url,
  modelo,
  chaveMascarada,
  bloqueado,
}: {
  url?: string;
  modelo?: string;
  /** Saved key, masked; undefined when the endpoint has none. */
  chaveMascarada?: string;
  bloqueado: boolean;
}) {
  const configurada = !!(url && modelo);
  const [editando, setEditando] = useState(!configurada);
  const [estado, acao, pendente] = useActionState<EstadoChave, FormData>(async (prev, form) => {
    const r = await acaoCompativel(prev, form);
    const intent = form.get("intent");
    if (intent === "salvar" && r?.tipo !== "erro") setEditando(false);
    if (intent === "remover" && r?.tipo === "ok") setEditando(true);
    return r;
  }, null);
  const desligado = bloqueado || pendente;

  return (
    <form action={acao} className="space-y-3">
      {editando ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="c-url" className="mb-1 block text-[13px] text-ink-2">
              URL base
            </label>
            <input
              id="c-url"
              name="url"
              type="url"
              required
              defaultValue={url}
              autoComplete="off"
              spellCheck={false}
              placeholder="http://localhost:11434/v1"
              disabled={desligado}
              className={CAMPO}
            />
          </div>
          <div>
            <label htmlFor="c-modelo" className="mb-1 block text-[13px] text-ink-2">
              Modelo
            </label>
            <input
              id="c-modelo"
              name="modelo"
              required
              defaultValue={modelo}
              autoComplete="off"
              spellCheck={false}
              placeholder="llama3.1:8b"
              disabled={desligado}
              className={CAMPO}
            />
          </div>
          <div>
            <label htmlFor="c-chave" className="mb-1 block text-[13px] text-ink-2">
              Chave <span className="text-muted">(opcional)</span>
            </label>
            <input
              id="c-chave"
              name="valor"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={chaveMascarada ? `Manter ${chaveMascarada}` : "Só se o servidor exigir"}
              disabled={desligado}
              className={CAMPO}
            />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="submit"
              name="intent"
              value="salvar"
              disabled={desligado}
              className="rounded-md bg-phosphor px-4 py-2 text-[13px] font-semibold text-bg hover:brightness-110 disabled:opacity-50"
            >
              {pendente ? "Testando…" : "Salvar e testar"}
            </button>
            {configurada && (
              <button
                type="button"
                onClick={() => setEditando(false)}
                disabled={pendente}
                className="rounded-md border border-line px-3 py-2 text-[13px] text-ink-2 hover:text-ink"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <dl className="grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-[80px_1fr]">
            <dt className="text-muted">URL</dt>
            <dd className="break-all font-mono text-ink-2">{url}</dd>
            <dt className="text-muted">Modelo</dt>
            <dd className="font-mono text-ink-2">{modelo}</dd>
            <dt className="text-muted">Chave</dt>
            <dd className="font-mono text-ink-2">{chaveMascarada ?? "nenhuma"}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditando(true)}
              disabled={desligado}
              className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink hover:border-line-strong disabled:opacity-50"
            >
              Alterar
            </button>
            <button
              type="submit"
              name="intent"
              value="remover"
              formNoValidate
              disabled={desligado}
              onClick={(e) => {
                if (!confirm("Remover esta configuração? Os resumos deixam de usar este servidor.")) e.preventDefault();
              }}
              className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:border-[color:var(--v-nao)] hover:text-[color:var(--v-nao)] disabled:opacity-50"
            >
              Remover
            </button>
          </div>
        </div>
      )}

      {estado && (
        <p role="status" className={`text-[13px] ${TOM[estado.tipo]}`}>
          {estado.msg}
        </p>
      )}
    </form>
  );
}
