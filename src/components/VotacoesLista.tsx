"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDayLong, formatTime, hasTime } from "@/lib/dates";
import type { Casa, VotacaoResumo } from "@/lib/types";
import { PlacarMini, ResultadoChip } from "./VoteBar";

type Filtro = "nominais" | "plenario" | "todas";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function VotacoesLista({ casa, votacoes }: { casa: Casa; votacoes: VotacaoResumo[] }) {
  const [filtro, setFiltro] = useState<Filtro>(casa === "camara" ? "nominais" : "todas");
  const [q, setQ] = useState("");

  const lista = useMemo(() => {
    const nq = norm(q.trim());
    return votacoes.filter((v) => {
      if (filtro === "nominais" && !v.nominal) return false;
      if (filtro === "plenario" && v.orgao !== "PLEN") return false;
      if (!nq) return true;
      return norm(`${v.proposicao?.sigla ?? ""} ${v.proposicao?.ementa ?? ""} ${v.descricao}`).includes(nq);
    });
  }, [votacoes, filtro, q]);

  const porDia = useMemo(() => {
    const m = new Map<string, VotacaoResumo[]>();
    for (const v of lista) {
      const d = v.data.slice(0, 10);
      m.set(d, [...(m.get(d) ?? []), v]);
    }
    return [...m.entries()];
  }, [lista]);

  const contagem = {
    nominais: votacoes.filter((v) => v.nominal).length,
    plenario: votacoes.filter((v) => v.orgao === "PLEN").length,
    todas: votacoes.length,
  };

  const filtros: { id: Filtro; label: string }[] =
    casa === "camara"
      ? [
          { id: "nominais", label: "Nominais" },
          { id: "plenario", label: "Plenário" },
          { id: "todas", label: "Todas" },
        ]
      : [{ id: "todas", label: "Nominais" }];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {filtros.length > 1 && (
          <div role="group" aria-label="Tipo de votação" className="flex rounded-lg border border-line p-0.5 text-[13px]">
            {filtros.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filtro === f.id}
                onClick={() => setFiltro(f.id)}
                className={`rounded-md px-2.5 py-1 ${filtro === f.id ? "bg-panel-2 text-ink" : "text-ink-2 hover:text-ink"}`}
              >
                {f.label} <span className="tnum text-muted">{contagem[f.id]}</span>
              </button>
            ))}
          </div>
        )}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por proposição ou tema"
          aria-label="Buscar votações"
          className="w-full rounded-md border border-line bg-bg px-3 py-1.5 text-[13px] placeholder:text-muted sm:ml-auto sm:w-72"
        />
      </div>

      {casa === "camara" && filtro !== "todas" && (
        <p className="mb-4 text-[12.5px] text-muted">
          Votações nominais registram o voto de cada deputado. As demais são simbólicas ou de procedimento e aparecem em
          &ldquo;Todas&rdquo;.
        </p>
      )}

      {porDia.length === 0 ? (
        <div className="panel p-8 text-center text-[14px] text-ink-2">
          Nenhuma votação {filtro === "nominais" ? "nominal " : ""}nesse período
          {q ? " com essa busca" : ""}. Aumente o período acima
          {filtro !== "todas" && casa === "camara" ? " ou veja todas as votações" : ""}.
        </div>
      ) : (
        <div className="space-y-6">
          {porDia.map(([dia, vs]) => (
            <section key={dia}>
              <h3 className="mb-2 font-display text-[14px] font-medium first-letter:uppercase text-ink-2">{formatDayLong(dia)}</h3>
              <ul className="panel divide-y divide-line overflow-hidden">
                {vs.map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`/${casa}/votacoes/${encodeURIComponent(v.id)}`}
                      className="grid gap-x-5 gap-y-2 px-4 py-3 transition-colors hover:bg-panel-2 sm:grid-cols-[52px_1fr_180px]"
                    >
                      <span className="tnum pt-0.5 text-[12.5px] text-muted">
                        {hasTime(v.data) ? formatTime(v.data) : ""}
                        <span className="block text-[11px]">{v.orgao}</span>
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          {v.proposicao && (
                            <span className="font-display text-[14.5px] font-semibold text-ink">{v.proposicao.sigla}</span>
                          )}
                          <ResultadoChip aprovada={v.aprovada} />
                        </span>
                        {v.proposicao?.ementa && (
                          <span className="mt-0.5 line-clamp-2 text-[13.5px] text-ink-2">{v.proposicao.ementa}</span>
                        )}
                        <span className="mt-1 line-clamp-2 text-[12.5px] text-muted">{v.descricao}</span>
                      </span>
                      <span className="self-center">
                        {v.placar && v.nominal ? (
                          <PlacarMini {...v.placar} />
                        ) : (
                          <span className="text-[12px] text-muted">Votação simbólica</span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
