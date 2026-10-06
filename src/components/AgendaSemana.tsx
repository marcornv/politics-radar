"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addDays, formatDay, formatTime, hasTime } from "@/lib/dates";
import type { Casa, EventoAgenda } from "@/lib/types";

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

type FiltroCasa = "ambas" | Casa;

const CASA_MARCA: Record<Casa, { label: string; cls: string }> = {
  camara: { label: "Câmara", cls: "bg-[#3987e5]/15 text-[#8fbaf2]" },
  senado: { label: "Senado", cls: "bg-[#199e70]/15 text-[#6fd3ad]" },
};

function encerrado(e: EventoAgenda) {
  return /encerrad|realizada|cancelad|n[ãa]o realizada/i.test(e.situacao);
}

export function AgendaSemana({ inicio, eventos, hoje }: { inicio: string; eventos: EventoAgenda[]; hoje: string }) {
  const [casa, setCasa] = useState<FiltroCasa>("ambas");
  const [soDeliberativas, setSoDeliberativas] = useState(false);

  const filtrados = useMemo(
    () =>
      eventos.filter(
        (e) => (casa === "ambas" || e.casa === casa) && (!soDeliberativas || e.deliberativo) && !/^cancelad/i.test(e.situacao),
      ),
    [eventos, casa, soDeliberativas],
  );

  const dias = DIAS.map((nome, i) => {
    const dia = addDays(inicio, i);
    return { nome, dia, eventos: filtrados.filter((e) => e.inicio.slice(0, 10) === dia) };
  }).filter((d, i) => i < 5 || d.eventos.length > 0);

  const resumo = (c: Casa) => {
    const es = eventos.filter((e) => e.casa === c && !/^cancelad/i.test(e.situacao));
    return {
      eventos: es.length,
      deliberativas: es.filter((e) => e.deliberativo).length,
      itens: es.reduce((a, e) => a + e.pauta.length, 0),
    };
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {(["camara", "senado"] as Casa[]).map((c) => {
          const r = resumo(c);
          return (
            <div key={c} className="panel flex items-center gap-5 px-4 py-3">
              <span className={`rounded px-1.5 py-0.5 text-[12px] font-medium ${CASA_MARCA[c].cls}`}>
                {CASA_MARCA[c].label}
              </span>
              <dl className="tnum flex gap-5 text-[12.5px] text-ink-2">
                <div>
                  <dt className="sr-only">Eventos</dt>
                  <dd>
                    <span className="font-display text-[18px] text-ink">{r.eventos}</span> eventos
                  </dd>
                </div>
                <div>
                  <dt className="sr-only">Reuniões deliberativas</dt>
                  <dd>
                    <span className="font-display text-[18px] text-ink">{r.deliberativas}</span> deliberativas
                  </dd>
                </div>
                <div>
                  <dt className="sr-only">Itens em pauta</dt>
                  <dd>
                    <span className="font-display text-[18px] text-ink">{r.itens}</span> itens em pauta
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Casa" className="flex rounded-lg border border-line p-0.5 text-[13px]">
          {(
            [
              ["ambas", "Ambas"],
              ["camara", "Câmara"],
              ["senado", "Senado"],
            ] as [FiltroCasa, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={casa === id}
              onClick={() => setCasa(id)}
              className={`rounded-md px-2.5 py-1 ${casa === id ? "bg-panel-2 text-ink" : "text-ink-2 hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
          <input
            type="checkbox"
            checked={soDeliberativas}
            onChange={(e) => setSoDeliberativas(e.target.checked)}
            className="accent-[var(--phosphor)]"
          />
          Só reuniões com votação
        </label>
      </div>

      {filtrados.length === 0 ? (
        <div className="panel p-8 text-center text-[14px] text-ink-2">
          Nenhum evento {soDeliberativas ? "deliberativo " : ""}marcado nesta semana
          {casa !== "ambas" ? ` ${casa === "camara" ? "na Câmara" : "no Senado"}` : ""}. Em semanas de recesso ou de
          eleição o Congresso costuma esvaziar; use as setas acima para ver outras semanas.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-5">
          {dias.map((d) => {
            const ehHoje = d.dia === hoje;
            return (
              <section key={d.dia} className="min-w-0">
                <h3
                  className={`mb-2 flex items-baseline gap-2 border-b pb-1.5 font-display text-[14px] ${
                    ehHoje ? "border-phosphor text-phosphor" : "border-line text-ink"
                  }`}
                >
                  <span className="font-semibold">{d.nome}</span>
                  <span className="tnum text-[12.5px] text-ink-2">{formatDay(d.dia)}</span>
                  {ehHoje && <span className="ml-auto text-[11.5px]">hoje</span>}
                </h3>
                {d.eventos.length === 0 ? (
                  <p className="px-1 py-3 text-[12.5px] text-muted">Sem eventos</p>
                ) : (
                  <ul className="space-y-2">
                    {d.eventos.map((e) => (
                      <li
                        key={e.id}
                        className={`rounded-lg border bg-panel px-3 py-2.5 ${
                          e.deliberativo ? "border-line-strong" : "border-line"
                        } ${encerrado(e) ? "opacity-70" : ""}`}
                      >
                        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                          <span className={`rounded px-1.5 py-px font-medium ${CASA_MARCA[e.casa].cls}`}>
                            {CASA_MARCA[e.casa].label}
                          </span>
                          <span className="font-medium text-ink" title={e.orgaoNome}>
                            {e.orgao}
                          </span>
                          {hasTime(e.inicio) && <span className="tnum ml-auto text-ink-2">{formatTime(e.inicio)}</span>}
                        </div>
                        <p className="mt-1 line-clamp-3 text-[13px] leading-snug text-ink">{e.titulo}</p>
                        <p className="mt-1 text-[11.5px] text-muted">
                          {e.deliberativo ? <span className="text-amber">Com votação</span> : "Sem votação"}
                          {e.situacao ? `, ${e.situacao.toLowerCase()}` : ""}
                        </p>
                        {e.pauta.length > 0 && (
                          <details className="mt-2 group">
                            <summary className="cursor-pointer text-[12px] text-phosphor">
                              {e.pauta.length} {e.pauta.length === 1 ? "item" : "itens"} na pauta
                            </summary>
                            <ol className="mt-1.5 space-y-1.5">
                              {e.pauta.slice(0, 40).map((it, i) => (
                                <li key={i} className="text-[12px] leading-snug">
                                  {it.proposicaoId ? (
                                    <Link
                                      href={`/${e.casa}/proposicoes/${it.proposicaoId}`}
                                      className="font-medium text-ink hover:text-phosphor"
                                    >
                                      {it.titulo}
                                    </Link>
                                  ) : (
                                    <span className="font-medium text-ink">{it.titulo}</span>
                                  )}
                                  {it.ementa && <span className="line-clamp-2 text-ink-2">{it.ementa}</span>}
                                </li>
                              ))}
                            </ol>
                          </details>
                        )}
                        {e.url && (
                          <a
                            href={e.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1.5 inline-block text-[11.5px] text-ink-2 hover:text-ink"
                          >
                            Página do evento
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
