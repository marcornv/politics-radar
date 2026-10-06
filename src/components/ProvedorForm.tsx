"use client";

import { useActionState } from "react";
import { acaoProvedor, type EstadoChave } from "@/app/configuracoes/actions";
import { TOM } from "./ChaveForm";

/** Picks which configured AI writes the summaries; saves as soon as an option is chosen. */
export function ProvedorForm({
  opcoes,
  ativo,
  bloqueado,
}: {
  opcoes: { valor: string; nome: string; modelo: string }[];
  ativo: string | null;
  bloqueado: boolean;
}) {
  const [estado, acao, pendente] = useActionState<EstadoChave, FormData>(acaoProvedor, null);

  return (
    <form action={acao} className="space-y-3">
      <fieldset disabled={bloqueado || pendente} className="flex flex-wrap gap-2 disabled:opacity-50">
        <legend className="mb-2 text-[13px] text-ink-2">IA usada nos resumos</legend>
        {opcoes.map((o) => (
          <label
            key={o.valor}
            className="flex cursor-pointer items-center gap-2.5 rounded-md border border-line px-3 py-2 text-[13px] text-ink hover:border-line-strong has-[:checked]:border-phosphor/60 has-[:checked]:bg-phosphor/[0.06]"
          >
            <input
              type="radio"
              name="provedor"
              value={o.valor}
              defaultChecked={o.valor === ativo}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="accent-phosphor"
            />
            <span>
              {o.nome}
              <code className="ml-2 text-[12px] text-muted">{o.modelo}</code>
            </span>
          </label>
        ))}
      </fieldset>
      {estado && (
        <p role="status" className={`text-[13px] ${TOM[estado.tipo]}`}>
          {estado.msg}
        </p>
      )}
    </form>
  );
}
