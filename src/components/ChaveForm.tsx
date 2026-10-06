"use client";

import { useActionState, useState } from "react";
import { acaoChave, type EstadoChave } from "@/app/configuracoes/actions";

const TOM = {
  ok: "text-phosphor",
  aviso: "text-amber",
  erro: "text-[color:var(--v-nao)]",
};

export function ChaveForm({
  nome,
  rotulo,
  placeholder,
  configurada,
  doApp,
  bloqueado,
}: {
  nome: string;
  rotulo: string;
  placeholder: string;
  configurada: boolean;
  /** Saved through this screen (removable here), as opposed to .env.local. */
  doApp: boolean;
  bloqueado: boolean;
}) {
  const [editando, setEditando] = useState(!configurada);
  const [estado, acao, pendente] = useActionState<EstadoChave, FormData>(async (prev, form) => {
    const r = await acaoChave(prev, form);
    const intent = form.get("intent");
    if (intent === "salvar" && r?.tipo !== "erro") setEditando(false);
    if (intent === "remover" && r?.tipo === "ok") setEditando(true);
    return r;
  }, null);
  const [mostrar, setMostrar] = useState(false);

  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="nome" value={nome} />

      {editando ? (
        <div>
          <label htmlFor={`v-${nome}`} className="mb-1 block text-[13px] text-ink-2">
            {rotulo}
          </label>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[240px] flex-1">
              <input
                id={`v-${nome}`}
                name="valor"
                type={mostrar ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                placeholder={placeholder}
                disabled={bloqueado || pendente}
                className="w-full rounded-md border border-line bg-bg px-3 py-2 pr-16 font-mono text-[13px] text-ink placeholder:font-sans placeholder:text-muted disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setMostrar((m) => !m)}
                className="absolute inset-y-0 right-2 text-[12px] text-ink-2 hover:text-ink"
                aria-label={mostrar ? "Esconder chave" : "Mostrar chave"}
              >
                {mostrar ? "Esconder" : "Mostrar"}
              </button>
            </div>
            <button
              type="submit"
              name="intent"
              value="salvar"
              disabled={bloqueado || pendente}
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
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="intent"
            value="testar"
            disabled={pendente}
            className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink hover:border-line-strong disabled:opacity-50"
          >
            {pendente ? "Testando…" : "Testar agora"}
          </button>
          <button
            type="button"
            onClick={() => setEditando(true)}
            disabled={bloqueado || pendente}
            className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink hover:border-line-strong disabled:opacity-50"
          >
            Trocar chave
          </button>
          {doApp && (
            <button
              type="submit"
              name="intent"
              value="remover"
              disabled={bloqueado || pendente}
              onClick={(e) => {
                if (!confirm("Remover esta chave? O recurso que depende dela fica desligado.")) e.preventDefault();
              }}
              className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:border-[color:var(--v-nao)] hover:text-[color:var(--v-nao)] disabled:opacity-50"
            >
              Remover
            </button>
          )}
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
