"use client";

import Link from "next/link";
import { useState } from "react";
import type { Resumo } from "@/lib/resumo";
import type { Casa } from "@/lib/types";

type Estado =
  | { tipo: "inativo" }
  | { tipo: "carregando" }
  | { tipo: "ok"; resumo: Resumo; comLeitor: boolean }
  | { tipo: "erro"; msg: string };

async function pedirResumo(casa: Casa, id: string, comLeitor: boolean): Promise<Estado> {
  try {
    const r = await fetch(`/api/resumo/${casa}/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comLeitor }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro ?? "Falha ao gerar o resumo.");
    return { tipo: "ok", resumo: j as Resumo, comLeitor };
  } catch (e) {
    return { tipo: "erro", msg: e instanceof Error ? e.message : "Falha ao gerar o resumo." };
  }
}

/**
 * Plain-language summary from the AI chosen in Configurações. Shown only when one is configured and
 * generated only when the reader clicks, with or without "Sobre você"; each version is cached on disk.
 */
export function ResumoCard({
  casa,
  id,
  disponivel,
  temPerfil = false,
}: {
  casa: Casa;
  id: string;
  disponivel: boolean;
  /** Whether "Sobre você" is filled in, which allows a summary with a "Para você" item. */
  temPerfil?: boolean;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: "inativo" });
  const [comLeitor, setComLeitor] = useState(temPerfil);

  const gerar = (usarPerfil = comLeitor) => {
    setComLeitor(usarPerfil);
    setEstado({ tipo: "carregando" });
    void pedirResumo(casa, id, usarPerfil).then(setEstado);
  };

  if (!disponivel) {
    return (
      <div className="rounded-lg border border-dashed border-line p-4 text-[13px] text-ink-2">
        <p className="font-medium text-ink">Resumo em linguagem simples desativado</p>
        <p className="mt-1">
          Para gerar resumos, configure uma IA (Anthropic, OpenAI, Groq ou um modelo local) em{" "}
          <Link href="/configuracoes" className="text-phosphor hover:underline">
            Configurações
          </Link>
          . A ementa oficial continua acima.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-phosphor/25 bg-phosphor/[0.04] p-4">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="font-display text-[14px] font-semibold text-phosphor">Em linguagem simples</h3>
        {estado.tipo === "ok" && (
          <span className="ml-auto text-[11px] text-muted">
            gerado por IA (<code>{estado.resumo.modelo}</code>) a partir dos dados oficiais
          </span>
        )}
      </div>

      {estado.tipo === "inativo" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => gerar()}
            className="rounded-md bg-phosphor px-4 py-1.5 text-[13px] font-semibold text-bg hover:brightness-110"
          >
            Gerar resumo
          </button>
          {temPerfil && (
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
              <input
                type="checkbox"
                checked={comLeitor}
                onChange={(e) => setComLeitor(e.target.checked)}
                className="accent-phosphor"
              />
              Usar meu &ldquo;Sobre você&rdquo;
            </label>
          )}
        </div>
      )}

      {estado.tipo === "carregando" && (
        <div role="status" className="space-y-2">
          <span className="sr-only">Gerando resumo</span>
          <div className="relative h-3 w-4/5 overflow-hidden rounded bg-line">
            <span className="scanline absolute inset-y-0 left-0 w-1/3 bg-phosphor/30" />
          </div>
          <div className="h-3 w-3/5 rounded bg-line" />
          <div className="h-3 w-2/3 rounded bg-line" />
        </div>
      )}

      {estado.tipo === "erro" && (
        <p className="text-[13px] text-ink-2">
          {estado.msg}{" "}
          <button type="button" onClick={() => gerar()} className="text-phosphor hover:underline">
            Tentar de novo
          </button>
        </p>
      )}

      {estado.tipo === "ok" && (
        <div className="space-y-3 text-[14px] leading-relaxed text-ink">
          <p>{estado.resumo.sintese}</p>
          {estado.resumo.mudancas.length > 0 && (
            <ul className="space-y-1 pl-4 text-ink-2 [list-style:square] marker:text-phosphor-dim">
              {estado.resumo.mudancas.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
          <dl className="grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-[110px_1fr]">
            {estado.resumo.paraVoce && (
              <>
                <dt className="text-phosphor">Para você</dt>
                <dd className="text-ink">{estado.resumo.paraVoce}</dd>
              </>
            )}
            <dt className="text-muted">Quem é afetado</dt>
            <dd className="text-ink-2">{estado.resumo.afetados}</dd>
            <dt className="text-muted">Próximo passo</dt>
            <dd className="text-ink-2">{estado.resumo.proximoPasso}</dd>
          </dl>
        </div>
      )}

      {estado.tipo === "ok" && temPerfil && (
        <button
          type="button"
          onClick={() => gerar(!estado.comLeitor)}
          className="mt-3 text-[12px] text-phosphor hover:underline"
        >
          {estado.comLeitor ? "Ver o resumo sem o meu \u201cSobre você\u201d" : "Ver o resumo com o meu \u201cSobre você\u201d"}
        </button>
      )}
    </div>
  );
}
