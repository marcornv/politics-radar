"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDate } from "@/lib/dates";
import type { Casa, VotoHistorico } from "@/lib/types";
import { VOTO_INFO, votoDaOrientacao } from "@/lib/votos";
import { ResultadoChip } from "./VoteBar";

type Filtro = "todas" | "contra" | "ausente";

function seguiu(h: VotoHistorico): boolean | null {
  const alvo = h.orientacao ? votoDaOrientacao(h.orientacao) : null;
  if (!alvo || !["sim", "nao", "abstencao", "obstrucao"].includes(h.voto)) return null;
  return h.voto === alvo;
}

/** Voted with the outcome: Sim on an approved item or Não on a rejected one. */
function comResultado(h: VotoHistorico): boolean | null {
  if (h.votacao.aprovada == null || (h.voto !== "sim" && h.voto !== "nao")) return null;
  return (h.voto === "sim") === h.votacao.aprovada;
}

export function VotosHistorico({ casa, itens, dias }: { casa: Casa; itens: VotoHistorico[]; dias: number }) {
  const [filtro, setFiltro] = useState<Filtro>("todas");

  const stats = useMemo(() => {
    const votou = itens.filter((h) => !["ausente"].includes(h.voto)).length;
    const orient = itens.map(seguiu).filter((x): x is boolean => x != null);
    const result = itens.map(comResultado).filter((x): x is boolean => x != null);
    return {
      total: itens.length,
      presenca: itens.length ? votou / itens.length : 0,
      fidelidade: orient.length ? orient.filter(Boolean).length / orient.length : null,
      nOrient: orient.length,
      contra: orient.filter((x) => !x).length,
      maioria: result.length ? result.filter(Boolean).length / result.length : null,
    };
  }, [itens]);

  const lista = itens.filter((h) =>
    filtro === "contra" ? seguiu(h) === false : filtro === "ausente" ? h.voto === "ausente" : true,
  );

  if (itens.length === 0) {
    return (
      <p className="panel p-6 text-[14px] text-ink-2">
        Nenhuma votação nominal registrada para este parlamentar nos últimos {dias} dias.
      </p>
    );
  }

  const pct = (x: number | null) => (x == null ? "n/d" : `${Math.round(x * 100)}%`);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [String(stats.total), "votações nominais", `nos últimos ${dias} dias`],
          [pct(stats.presenca), "participação", "votou ou registrou presença"],
          [pct(stats.fidelidade), "seguiu o partido", stats.nOrient ? `em ${stats.nOrient} com orientação` : "sem orientação publicada"],
          [pct(stats.maioria), "votou com o resultado", "sim no aprovado, não no rejeitado"],
        ].map(([n, l, s]) => (
          <div key={l} className="panel p-4">
            <div className="font-display tnum text-[26px] font-semibold leading-none">{n}</div>
            <div className="mt-1 text-[12.5px] text-ink">{l}</div>
            <div className="text-[11.5px] text-muted">{s}</div>
          </div>
        ))}
      </div>

      <div role="group" aria-label="Filtrar votos" className="flex flex-wrap gap-1">
        {(
          [
            ["todas", `Todas ${stats.total}`],
            ...(stats.contra ? [["contra", `Contra a orientação ${stats.contra}`]] : []),
            ...(itens.some((h) => h.voto === "ausente") ? [["ausente", `Não votou ${itens.filter((h) => h.voto === "ausente").length}`]] : []),
          ] as [Filtro, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={filtro === id}
            onClick={() => setFiltro(id)}
            className={`rounded-full border px-2.5 py-0.5 text-[12.5px] ${
              filtro === id ? "border-phosphor bg-phosphor/10 text-phosphor" : "border-line text-ink-2 hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="panel divide-y divide-line overflow-hidden">
        {lista.map((h) => {
          const s = seguiu(h);
          const info = VOTO_INFO[h.voto];
          return (
            <li key={h.votacao.id}>
              <Link
                href={`/${casa}/votacoes/${encodeURIComponent(h.votacao.id)}`}
                className="grid gap-x-4 gap-y-1 px-4 py-2.5 hover:bg-panel-2 sm:grid-cols-[90px_1fr_170px]"
              >
                <span className="tnum text-[12.5px] text-ink-2">{formatDate(h.votacao.data)}</span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-[14px] font-semibold text-ink">
                      {h.votacao.proposicao?.sigla ?? h.votacao.orgao}
                    </span>
                    <ResultadoChip aprovada={h.votacao.aprovada} />
                  </span>
                  {h.votacao.proposicao?.ementa && (
                    <span className="mt-0.5 line-clamp-1 text-[12.5px] text-ink-2">{h.votacao.proposicao.ementa}</span>
                  )}
                  {/* one bill can have several votes (text, amendments, highlights): the description tells them apart */}
                  <span className="mt-0.5 line-clamp-1 text-[12px] text-muted">{h.votacao.descricao}</span>
                </span>
                <span className="flex items-center gap-2 text-[13px] sm:justify-end">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={info.hollow ? { boxShadow: `inset 0 0 0 1.5px ${info.cor}` } : { background: info.cor }}
                    aria-hidden
                  />
                  <span className="text-ink">{h.voto === "ausente" ? h.rotulo : info.label}</span>
                  {s === false && (
                    <span className="text-[11.5px] text-amber" title={`Orientação: ${h.orientacao}`}>
                      contra
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
