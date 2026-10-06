"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDay } from "@/lib/dates";
import { ETAPAS, FASE_LABEL } from "@/lib/fase";
import type { Casa, Comissao, Etapa, ProposicaoTramitando } from "@/lib/types";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** One ordinal ramp (phosphor), stepping brighter as a bill gets closer to a vote. */
const ETAPA_TOM: Record<Etapa, string> = {
  aguardando_relator: "#2f5a63",
  em_analise: "#3f7d80",
  pronta_pauta: "#5fae9f",
  em_pauta: "#b8f2e6",
  deliberada: "#8fa3c4",
  outra: "#4a5a7a",
};

export function TramitacaoBoard({
  casa,
  itens,
  comissoes,
}: {
  casa: Casa;
  itens: ProposicaoTramitando[];
  comissoes: Comissao[];
}) {
  const tipos = useMemo(() => [...new Set(itens.map((i) => i.tipo))].sort(), [itens]);
  const [tiposOn, setTiposOn] = useState<Set<string>>(new Set());
  const [orgao, setOrgao] = useState<string>("");
  const [q, setQ] = useState("");

  const nomeOrgao = useMemo(() => new Map(comissoes.map((c) => [c.sigla, c.nome])), [comissoes]);

  const filtrados = useMemo(() => {
    const nq = norm(q.trim());
    return itens.filter(
      (i) =>
        (tiposOn.size === 0 || tiposOn.has(i.tipo)) &&
        (!orgao || i.orgao === orgao) &&
        (!nq || norm(`${i.sigla} ${i.ementa}`).includes(nq)),
    );
  }, [itens, tiposOn, orgao, q]);

  const orgaos = useMemo(() => {
    const c = new Map<string, number>();
    for (const i of itens) c.set(i.orgao, (c.get(i.orgao) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [itens]);

  const colunas = ETAPAS.map((e) => ({
    ...e,
    itens: filtrados
      .filter((i) => i.etapa === e.id)
      .sort((a, b) => b.dataSituacao.localeCompare(a.dataSituacao) || a.id.localeCompare(b.id)),
  })).filter((c) => c.itens.length > 0);

  const total = filtrados.length || 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Tipo de proposição" className="flex flex-wrap gap-1">
          {tipos.map((t) => {
            const on = tiposOn.has(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setTiposOn((s) => {
                    const n = new Set(s);
                    if (on) n.delete(t);
                    else n.add(t);
                    return n;
                  })
                }
                className={`rounded-full border px-2.5 py-0.5 text-[12.5px] ${
                  on ? "border-phosphor bg-phosphor/10 text-phosphor" : "border-line text-ink-2 hover:text-ink"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
        <select
          value={orgao}
          onChange={(e) => setOrgao(e.target.value)}
          aria-label="Filtrar por comissão ou órgão"
          className="rounded-md border border-line bg-bg px-2 py-1.5 text-[13px] text-ink"
        >
          <option value="">Todas as comissões e órgãos</option>
          {orgaos.map(([o, n]) => (
            <option key={o} value={o}>
              {o}
              {nomeOrgao.get(o) ? `: ${nomeOrgao.get(o)}` : ""} ({n})
            </option>
          ))}
        </select>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por número ou tema"
          aria-label="Buscar proposição"
          className="w-full rounded-md border border-line bg-bg px-3 py-1.5 text-[13px] placeholder:text-muted sm:ml-auto sm:w-64"
        />
      </div>

      {/* Funnel: where the filtered bills are right now */}
      <div className="panel p-4">
        <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" aria-hidden>
          {colunas.map((c) => (
            <span key={c.id} style={{ flexGrow: c.itens.length, background: ETAPA_TOM[c.id] }} />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px]">
          {colunas.map((c) => (
            <li key={c.id} className="flex items-center gap-1.5 text-ink-2" title={c.hint}>
              <span className="h-2 w-2 rounded-sm" style={{ background: ETAPA_TOM[c.id] }} aria-hidden />
              {c.label}
              <span className="tnum text-ink">{c.itens.length}</span>
              <span className="tnum text-muted">{Math.round((c.itens.length / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>

      {colunas.length === 0 ? (
        <div className="panel p-8 text-center text-[14px] text-ink-2">
          Nenhuma proposição com esses filtros. Remova algum tipo, troque a comissão ou amplie o período.
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          <div className="grid auto-cols-[minmax(260px,1fr)] grid-flow-col gap-3">
            {colunas.map((c) => (
              <section key={c.id} className="flex min-w-0 flex-col rounded-xl border border-line bg-panel/60">
                <header className="sticky top-0 border-b border-line px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-sm" style={{ background: ETAPA_TOM[c.id] }} aria-hidden />
                    <h3 className="font-display text-[14px] font-semibold text-ink">{c.label}</h3>
                    <span className="tnum ml-auto text-[13px] text-ink-2">{c.itens.length}</span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-muted">{c.hint}</p>
                </header>
                <ul className="max-h-[640px] space-y-2 overflow-y-auto p-2">
                  {c.itens.slice(0, 150).map((i) => (
                    <li key={i.id}>
                      <Link
                        href={`/${casa}/proposicoes/${i.id}`}
                        className="block rounded-lg border border-line bg-panel px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-panel-2"
                      >
                        <span className="flex items-baseline gap-2">
                          <span className="font-display text-[14px] font-semibold text-ink">{i.sigla}</span>
                          {i.regime && /urg/i.test(i.regime) && (
                            <span className="text-[11px] font-medium text-amber">urgência</span>
                          )}
                          <span className="tnum ml-auto text-[11.5px] text-muted">
                            {i.dataSituacao ? formatDay(i.dataSituacao) : ""}
                          </span>
                        </span>
                        <span className="mt-1 line-clamp-3 text-[12.5px] leading-snug text-ink-2">{i.ementa}</span>
                        <span className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px]">
                          <span className="rounded border border-line px-1.5 text-ink" title={nomeOrgao.get(i.orgao)}>
                            {i.orgao || "?"}
                          </span>
                          <span className="text-muted">{FASE_LABEL[i.fase]}</span>
                          {i.situacao && c.id === "outra" && <span className="text-muted">, {i.situacao}</span>}
                        </span>
                      </Link>
                    </li>
                  ))}
                  {c.itens.length > 150 && (
                    <li className="px-2 py-2 text-center text-[12px] text-muted">
                      E mais {c.itens.length - 150}. Use os filtros para refinar.
                    </li>
                  )}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
