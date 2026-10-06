"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDate } from "@/lib/dates";
import type { EmendaProjeto, ResultadoEmenda } from "@/lib/types";

export const RESULTADO_INFO: Record<ResultadoEmenda, { label: string; cor: string; hollow?: boolean }> = {
  aprovada: { label: "Aprovada", cor: "#3f8fea" },
  parcial: { label: "Acolhida em parte", cor: "#8fbaf2" },
  rejeitada: { label: "Rejeitada", cor: "#e66767" },
  prejudicada: { label: "Prejudicada", cor: "#9aa6bd" },
  retirada: { label: "Retirada pelo autor", cor: "#5d6b86" },
  pendente: { label: "Sem decisão", cor: "#4a5a7a", hollow: true },
  desconhecido: { label: "Resultado não publicado", cor: "#4a5a7a", hollow: true },
};

const ORDEM: ResultadoEmenda[] = ["aprovada", "parcial", "rejeitada", "prejudicada", "retirada", "pendente", "desconhecido"];

type Filtro = "todas" | "concluidas" | ResultadoEmenda;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export interface AutorLink {
  href: string;
  nome: string;
}

export function EmendasProjetoLista({
  itens,
  mostrarAutor = false,
  autores = {},
  filtroInicial = "todas",
}: {
  itens: EmendaProjeto[];
  mostrarAutor?: boolean;
  /** Profile link per amendment id, when the author is a current member. */
  autores?: Record<string, AutorLink>;
  filtroInicial?: Filtro;
}) {
  const [filtro, setFiltro] = useState<Filtro>(filtroInicial);
  const [q, setQ] = useState("");
  const [limite, setLimite] = useState(40);

  const contagem = useMemo(() => {
    const c = Object.fromEntries(ORDEM.map((r) => [r, 0])) as Record<ResultadoEmenda, number>;
    for (const e of itens) c[e.resultado]++;
    return c;
  }, [itens]);
  const concluidas = itens.length - contagem.pendente - contagem.desconhecido;
  const semResultado = contagem.desconhecido === itens.length;

  const lista = useMemo(() => {
    const nq = norm(q.trim());
    return itens.filter((e) => {
      if (filtro === "concluidas" && (e.resultado === "pendente" || e.resultado === "desconhecido")) return false;
      if (filtro !== "todas" && filtro !== "concluidas" && e.resultado !== filtro) return false;
      return !nq || norm(`${e.identificacao} ${e.ementa ?? ""} ${e.autoria} ${e.emendado?.sigla ?? ""}`).includes(nq);
    });
  }, [itens, filtro, q]);

  const presentes = ORDEM.filter((r) => contagem[r] > 0);
  const opcoes: { id: Filtro; label: string; n: number }[] = semResultado
    ? [{ id: "todas", label: "Todas", n: itens.length }]
    : [
        { id: "todas", label: "Todas", n: itens.length },
        { id: "concluidas", label: "Concluídas", n: concluidas },
        ...presentes.map((r) => ({ id: r as Filtro, label: RESULTADO_INFO[r].label, n: contagem[r] })),
      ];

  if (itens.length === 0) {
    return <p className="panel p-6 text-[14px] text-ink-2">Nenhuma emenda encontrada nesta legislatura.</p>;
  }

  return (
    <div className="space-y-4">
      {!semResultado && (
        <div className="panel p-4">
          <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full" aria-hidden>
            {presentes.map((r) => (
              <span
                key={r}
                style={{
                  flexGrow: contagem[r],
                  background: RESULTADO_INFO[r].hollow ? "transparent" : RESULTADO_INFO[r].cor,
                  boxShadow: RESULTADO_INFO[r].hollow ? `inset 0 0 0 1px ${RESULTADO_INFO[r].cor}` : undefined,
                }}
              />
            ))}
          </div>
          <p className="tnum mt-2 text-[12.5px] text-ink-2">
            <span className="text-ink">{concluidas}</span> de {itens.length} já tiveram decisão.{" "}
            {contagem.aprovada + contagem.parcial > 0 && (
              <>
                <span className="text-ink">{contagem.aprovada + contagem.parcial}</span> aprovadas no todo ou em parte.
              </>
            )}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {opcoes.length > 1 && (
          <div role="group" aria-label="Resultado" className="flex flex-wrap gap-1">
            {opcoes.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={filtro === o.id}
                onClick={() => setFiltro(o.id)}
                className={`rounded-full border px-2.5 py-0.5 text-[12.5px] ${
                  filtro === o.id ? "border-phosphor bg-phosphor/10 text-phosphor" : "border-line text-ink-2 hover:text-ink"
                }`}
              >
                {o.label} <span className="tnum text-muted">{o.n}</span>
              </button>
            ))}
          </div>
        )}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={mostrarAutor ? "Buscar por autor, matéria ou tema" : "Buscar por matéria ou tema"}
          aria-label="Buscar emendas"
          className="w-full rounded-md border border-line bg-bg px-3 py-1.5 text-[13px] placeholder:text-muted sm:ml-auto sm:w-64"
        />
      </div>

      {lista.length === 0 ? (
        <p className="panel p-6 text-center text-[14px] text-ink-2">Nenhuma emenda com esse filtro.</p>
      ) : (
        <ul className="panel divide-y divide-line overflow-hidden">
          {lista.slice(0, limite).map((e) => {
            const info = RESULTADO_INFO[e.resultado];
            const autor = autores[e.id];
            return (
              <li key={e.id} className="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[1fr_190px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-[12.5px] text-ink-2">
                    <span className="font-display text-[14px] font-semibold text-ink">{e.identificacao.split(" - ")[0]}</span>
                    {e.emendado && (
                      <>
                        <span>à</span>
                        <Link href={`/${e.casa}/proposicoes/${e.emendado.id}`} className="text-phosphor hover:underline">
                          {e.emendado.sigla}
                        </Link>
                      </>
                    )}
                    {e.colegiado && <span className="rounded border border-line px-1.5 text-[11.5px] text-ink">{e.colegiado}</span>}
                    <span className="tnum">{e.data ? formatDate(e.data) : ""}</span>
                  </div>
                  {mostrarAutor && (
                    <div className="mt-0.5 text-[13px]">
                      {autor ? (
                        <Link href={autor.href} className="text-ink underline decoration-line-strong underline-offset-[3px] hover:text-phosphor">
                          {e.autoria}
                        </Link>
                      ) : (
                        <span className="text-ink">{e.autoria}</span>
                      )}
                    </div>
                  )}
                  {e.ementa && <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-2">{e.ementa}</p>}
                  {e.url && (
                    <a href={e.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-block text-[12px] text-ink-2 hover:text-ink">
                      Texto da emenda
                    </a>
                  )}
                </div>
                <div className="flex items-start gap-2 text-[12.5px] sm:justify-end">
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={info.hollow ? { boxShadow: `inset 0 0 0 1.5px ${info.cor}` } : { background: info.cor }}
                    aria-hidden
                  />
                  <span className="text-ink">
                    {e.resultadoTexto || info.label}
                    {e.dataResultado && <span className="tnum block text-[11.5px] text-muted">{formatDate(e.dataResultado)}</span>}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {lista.length > limite && (
        <button
          type="button"
          onClick={() => setLimite((l) => l + 40)}
          className="w-full rounded-lg border border-line py-2 text-[13px] text-phosphor hover:border-line-strong"
        >
          Mostrar mais ({lista.length - limite} restantes)
        </button>
      )}
      {semResultado && (
        <p className="text-[12.5px] text-muted">
          A Câmara não publica nos dados abertos o resultado das emendas nem a qual projeto cada uma se refere. Abra o texto
          da emenda para ver os detalhes.
        </p>
      )}
    </div>
  );
}
