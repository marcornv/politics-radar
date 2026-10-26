"use client";

import { useActionState, useState } from "react";
import { acaoPersonalizacao, type EstadoChave } from "@/app/configuracoes/actions";
import { TOM } from "./ChaveForm";

const CAMPO =
  "w-full rounded-md border border-line bg-bg px-3 py-2 text-[13px] leading-relaxed text-ink placeholder:text-muted disabled:opacity-50";

/** Who the reader is, plus the instructions the AI follows; the JSON format of the summary stays fixed. */
export function PersonalizacaoForm({
  contexto,
  instrucoes,
  instrucoesPadrao,
  limiteContexto,
  limiteInstrucoes,
  bloqueado,
}: {
  contexto?: string;
  /** Saved instructions; undefined when the default is in use. */
  instrucoes?: string;
  instrucoesPadrao: string;
  limiteContexto: number;
  limiteInstrucoes: number;
  bloqueado: boolean;
}) {
  const [texto, setTexto] = useState(contexto ?? "");
  const [regras, setRegras] = useState(instrucoes ?? instrucoesPadrao);
  const [estado, acao, pendente] = useActionState<EstadoChave, FormData>(async (prev, form) => {
    const r = await acaoPersonalizacao(prev, form);
    if (form.get("intent") === "restaurar" && r?.tipo === "ok") setRegras(instrucoesPadrao);
    return r;
  }, null);
  const desligado = bloqueado || pendente;

  return (
    <form action={acao} className="space-y-4">
      <div>
        <label htmlFor="p-contexto" className="mb-1 block text-[13px] text-ink-2">
          Sobre você <span className="text-muted">(opcional)</span>
        </label>
        <textarea
          id="p-contexto"
          name="contexto"
          rows={3}
          maxLength={limiteContexto}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ex.: sou estudante de medicina e me interesso por saúde pública"
          disabled={desligado}
          className={CAMPO}
        />
        <p className="mt-1 text-[12px] text-muted">
          Com isso preenchido, ao gerar um resumo você pode marcar &ldquo;Usar meu Sobre você&rdquo; e ele ganha um item
          &ldquo;Para você&rdquo;, explicando por que a proposta importa no seu caso.{" "}
          <span className="tnum">
            {texto.length}/{limiteContexto}
          </span>
        </p>
      </div>

      <details className="rounded-md border border-line p-3" open={!!instrucoes}>
        <summary className="cursor-pointer text-[13px] text-ink-2 hover:text-ink">Avançado: instruções da IA</summary>
        <div className="mt-3 space-y-2">
          <textarea
            name="instrucoes"
            aria-label="Instruções da IA"
            rows={6}
            maxLength={limiteInstrucoes}
            value={regras}
            onChange={(e) => setRegras(e.target.value)}
            disabled={desligado}
            className={`${CAMPO} font-mono`}
          />
          <p className="text-[12px] text-muted">
            Mude o tom, o nível de detalhe ou o foco. O formato do resumo (síntese, mudanças, quem é afetado, próximo
            passo) é fixo, e a IA continua sem dar opinião política e usando só os dados oficiais.
          </p>
          {instrucoes && (
            <button
              type="submit"
              name="intent"
              value="restaurar"
              formNoValidate
              disabled={desligado}
              className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              Restaurar padrão
            </button>
          )}
        </div>
      </details>

      <button
        type="submit"
        name="intent"
        value="salvar"
        disabled={desligado}
        className="rounded-md bg-phosphor px-4 py-2 text-[13px] font-semibold text-bg hover:brightness-110 disabled:opacity-50"
      >
        {pendente ? "Salvando…" : "Salvar"}
      </button>

      {estado && (
        <p role="status" className={`text-[13px] ${TOM[estado.tipo]}`}>
          {estado.msg}
        </p>
      )}
    </form>
  );
}
