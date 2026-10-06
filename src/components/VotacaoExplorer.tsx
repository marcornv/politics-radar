"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { corPartido, ordemPartido, UF_NOME } from "@/lib/partidos";
import type { TipoVoto, VotacaoDetalhe, Voto } from "@/lib/types";
import { ORDEM_VOTOS, orientacaoDoPartido, VOTO_INFO, votoDaOrientacao } from "@/lib/votos";
import { Hemicycle, type Seat } from "./Hemicycle";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

interface LinhaPartido {
  partido: string;
  total: number;
  por: Record<TipoVoto, number>;
  orientacao?: string;
  /** Share of members who voted (sim/não/abst/obs) following the orientation. */
  fidelidade: number | null;
}

export function VotacaoExplorer({ v }: { v: VotacaoDetalhe }) {
  const router = useRouter();
  const [hoverVoto, setHoverVoto] = useState<string | null>(null);
  const [filtroVoto, setFiltroVoto] = useState<TipoVoto | null>(null);
  const [partido, setPartido] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const votos = useMemo(
    () =>
      [...v.votos].sort(
        (a, b) =>
          ordemPartido(a.parlamentar.partido) - ordemPartido(b.parlamentar.partido) ||
          a.parlamentar.partido.localeCompare(b.parlamentar.partido) ||
          ORDEM_VOTOS.indexOf(a.voto) - ORDEM_VOTOS.indexOf(b.voto) ||
          a.parlamentar.nome.localeCompare(b.parlamentar.nome),
      ),
    [v.votos],
  );

  const contagem = useMemo(() => {
    const c = Object.fromEntries(ORDEM_VOTOS.map((t) => [t, 0])) as Record<TipoVoto, number>;
    for (const x of votos) c[x.voto]++;
    return c;
  }, [votos]);
  const presentes = ORDEM_VOTOS.filter((t) => contagem[t] > 0);

  const linhas: LinhaPartido[] = useMemo(() => {
    const m = new Map<string, Voto[]>();
    for (const x of votos) m.set(x.parlamentar.partido, [...(m.get(x.parlamentar.partido) ?? []), x]);
    return [...m.entries()]
      .map(([p, vs]) => {
        const por = Object.fromEntries(ORDEM_VOTOS.map((t) => [t, 0])) as Record<TipoVoto, number>;
        for (const x of vs) por[x.voto]++;
        const o = orientacaoDoPartido(p, v.orientacoes);
        const alvo = o ? votoDaOrientacao(o.orientacao) : null;
        const votaram = por.sim + por.nao + por.abstencao + por.obstrucao;
        return {
          partido: p,
          total: vs.length,
          por,
          orientacao: o?.orientacao,
          fidelidade: alvo && votaram ? por[alvo] / votaram : null,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [votos, v.orientacoes]);

  const seats: Seat[] = useMemo(
    () =>
      votos.map((x) => ({
        key: x.parlamentar.id,
        color: VOTO_INFO[x.voto].cor,
        hollow: VOTO_INFO[x.voto].hollow,
        group: x.voto,
        title: x.parlamentar.nome,
        sub: `${x.parlamentar.partido} / ${UF_NOME[x.parlamentar.uf] ?? x.parlamentar.uf}`,
        detail: x.voto === "ausente" ? x.rotulo : VOTO_INFO[x.voto].label,
        foto: x.parlamentar.foto,
        href: `/${v.casa}/parlamentares/${x.parlamentar.id}`,
      })),
    [votos, v.casa],
  );

  const lit = useMemo(
    () => (partido ? new Set(votos.filter((x) => x.parlamentar.partido === partido).map((x) => x.parlamentar.id)) : null),
    [votos, partido],
  );

  const lista = useMemo(() => {
    const nq = norm(q.trim());
    return votos.filter(
      (x) =>
        (!filtroVoto || x.voto === filtroVoto) &&
        (!partido || x.parlamentar.partido === partido) &&
        (!nq || norm(x.parlamentar.nome).includes(nq)),
    );
  }, [votos, filtroVoto, partido, q]);

  const destaque = hoverVoto ?? filtroVoto;
  const numeroCentro = destaque ? contagem[destaque as TipoVoto] : partido ? lit?.size : (v.placar?.sim ?? contagem.sim);
  const legendaCentro = destaque
    ? VOTO_INFO[destaque as TipoVoto].label.toLowerCase()
    : partido
      ? `parlamentares do ${partido}`
      : v.secreta
        ? "votos sim (votação secreta)"
        : "votos sim";

  return (
    <div className="space-y-6">
      <section className="panel radar-grid grid gap-6 p-4 sm:p-6 xl:grid-cols-[1fr_260px]">
        <div className="min-w-0">
          <Hemicycle
            seats={seats}
            lit={lit}
            highlightGroup={destaque}
            onGroupHover={setHoverVoto}
            onSeatClick={(s) => s.href && router.push(s.href)}
            ariaLabel="Assentos coloridos pelo voto de cada parlamentar"
            center={
              <>
                <span className="font-display tnum text-[clamp(40px,7vw,76px)] font-semibold leading-none">{numeroCentro}</span>
                <span className="mt-1 text-[13px] text-ink-2">{legendaCentro}</span>
              </>
            }
          />
          {v.secreta && (
            <p className="mt-4 text-center text-[12.5px] text-muted">
              Votação secreta: a fonte oficial informa apenas quem votou, não o voto de cada um.
            </p>
          )}
        </div>
        <div>
          <h2 className="mb-2 px-2 font-display text-[15px] font-semibold">Votos</h2>
          <ul className="space-y-px" onMouseLeave={() => setHoverVoto(null)}>
            {presentes.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  onMouseEnter={() => setHoverVoto(t)}
                  onFocus={() => setHoverVoto(t)}
                  onBlur={() => setHoverVoto(null)}
                  onClick={() => setFiltroVoto((f) => (f === t ? null : t))}
                  aria-pressed={filtroVoto === t}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13.5px] ${
                    destaque === t ? "bg-panel-2" : "hover:bg-panel-2/60"
                  } ${destaque && destaque !== t ? "opacity-45" : ""}`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={
                      VOTO_INFO[t].hollow
                        ? { boxShadow: `inset 0 0 0 1.5px ${VOTO_INFO[t].cor}` }
                        : { background: VOTO_INFO[t].cor }
                    }
                    aria-hidden
                  />
                  <span className="flex-1 text-ink">{VOTO_INFO[t].label}</span>
                  <span className="tnum text-ink">{contagem[t]}</span>
                </button>
              </li>
            ))}
          </ul>
          {partido && (
            <button
              type="button"
              onClick={() => setPartido(null)}
              className="mt-3 px-2 text-[12px] text-phosphor hover:underline"
            >
              Mostrar todos os partidos
            </button>
          )}
        </div>
      </section>

      {!v.secreta && (
        <section className="panel min-w-0 p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-[15px] font-semibold">Como votou cada bancada</h2>
            <span className="text-[12px] text-muted">
              Fidelidade: parcela de quem votou que seguiu a orientação da bancada
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-muted">
                  <th className="py-2 pr-3 font-normal">Partido</th>
                  <th className="w-[45%] py-2 pr-3 font-normal">Votos</th>
                  <th className="py-2 pr-3 font-normal">Orientação</th>
                  <th className="py-2 text-right font-normal">Fidelidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {linhas.map((l) => (
                  <tr
                    key={l.partido}
                    className={`cursor-pointer transition-colors hover:bg-panel-2 ${partido === l.partido ? "bg-panel-2" : ""}`}
                    onClick={() => setPartido((p) => (p === l.partido ? null : l.partido))}
                  >
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: corPartido(l.partido) }} aria-hidden />
                        <span className="font-medium text-ink">{l.partido}</span>
                        <span className="tnum text-muted">{l.total}</span>
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-line/40" aria-hidden>
                        {ORDEM_VOTOS.filter((t) => l.por[t] > 0).map((t) => (
                          <span
                            key={t}
                            style={{
                              flexGrow: l.por[t],
                              background: VOTO_INFO[t].hollow ? "transparent" : VOTO_INFO[t].cor,
                              boxShadow: VOTO_INFO[t].hollow ? `inset 0 0 0 1px ${VOTO_INFO[t].cor}` : undefined,
                            }}
                          />
                        ))}
                      </div>
                      <div className="tnum mt-1 flex flex-wrap gap-x-3 text-[11.5px] text-ink-2">
                        {ORDEM_VOTOS.filter((t) => l.por[t] > 0).map((t) => (
                          <span key={t}>
                            <span className="text-ink">{l.por[t]}</span> {VOTO_INFO[t].label.toLowerCase()}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-ink-2">{l.orientacao ?? <span className="text-muted">sem registro</span>}</td>
                    <td className="tnum py-2 text-right text-ink">
                      {l.fidelidade == null ? <span className="text-muted">n/d</span> : `${Math.round(l.fidelidade * 100)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {v.orientacoes.some((o) => !o.derivada) && (
            <details className="mt-3 text-[12.5px] text-ink-2">
              <summary className="cursor-pointer text-phosphor">Todas as orientações registradas</summary>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {v.orientacoes.filter((o) => !o.derivada).map((o) => (
                  <li key={o.bancada}>
                    <span className="text-ink">{o.bancada}</span>: {o.orientacao}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <section className="panel min-w-0 p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="font-display text-[15px] font-semibold">
            Votos nominais <span className="tnum ml-1 text-[13px] font-normal text-muted">{lista.length}</span>
          </h2>
          {(filtroVoto || partido) && (
            <span className="text-[12px] text-ink-2">
              Filtrando
              {filtroVoto && <> por {VOTO_INFO[filtroVoto].label.toLowerCase()}</>}
              {partido && <> no {partido}</>}.{" "}
              <button
                type="button"
                className="text-phosphor hover:underline"
                onClick={() => {
                  setFiltroVoto(null);
                  setPartido(null);
                }}
              >
                Limpar
              </button>
            </span>
          )}
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome"
            aria-label="Buscar parlamentar"
            className="w-full rounded-md border border-line bg-bg px-3 py-1.5 text-[13px] placeholder:text-muted sm:ml-auto sm:w-56"
          />
        </div>
        <ul className="grid max-h-[560px] grid-cols-1 gap-x-4 overflow-y-auto pr-1 sm:grid-cols-2 2xl:grid-cols-3">
          {lista.map((x) => (
            <li key={x.parlamentar.id} className="flex items-center gap-3 border-b border-line/60 py-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={x.parlamentar.foto}
                alt=""
                loading="lazy"
                width={28}
                height={28}
                className="h-7 w-7 shrink-0 rounded-full bg-line object-cover"
              />
              <span className="min-w-0 flex-1">
                <Link
                  href={`/${v.casa}/parlamentares/${x.parlamentar.id}`}
                  className="block truncate text-[13px] text-ink hover:text-phosphor"
                >
                  {x.parlamentar.nome}
                </Link>
                <span className="block text-[11.5px] text-muted">
                  {x.parlamentar.partido} / {x.parlamentar.uf}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-ink-2" title={x.rotulo}>
                <span
                  className="h-2 w-2 rounded-full"
                  style={
                    VOTO_INFO[x.voto].hollow
                      ? { boxShadow: `inset 0 0 0 1.5px ${VOTO_INFO[x.voto].cor}` }
                      : { background: VOTO_INFO[x.voto].cor }
                  }
                  aria-hidden
                />
                {x.voto === "ausente" ? x.rotulo : VOTO_INFO[x.voto].label}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
