"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { corPartido, ordemPartido, UF_NOME } from "@/lib/partidos";
import type { Casa, Parlamentar } from "@/lib/types";
import { Hemicycle, type Seat } from "./Hemicycle";
import { PartyLegend } from "./PartyLegend";
import { StateGrid } from "./StateGrid";

export function ordenarMembros(ms: Parlamentar[]) {
  return [...ms].sort(
    (a, b) =>
      ordemPartido(a.partido) - ordemPartido(b.partido) ||
      a.partido.localeCompare(b.partido) ||
      a.uf.localeCompare(b.uf) ||
      a.nome.localeCompare(b.nome),
  );
}

export function contarPartidos(ms: Parlamentar[]) {
  const c = new Map<string, number>();
  for (const m of ms) c.set(m.partido, (c.get(m.partido) ?? 0) + 1);
  return [...c.entries()].map(([partido, n]) => ({ partido, n })).sort((a, b) => b.n - a.n);
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function ComposicaoExplorer({ casa, membros }: { casa: Casa; membros: Parlamentar[] }) {
  const router = useRouter();
  const [hover, setHover] = useState<string | null>(null);
  const [travado, setTravado] = useState<string | null>(null);
  const [uf, setUf] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const ordenados = useMemo(() => ordenarMembros(membros), [membros]);
  const partidos = useMemo(() => contarPartidos(membros), [membros]);
  const ativo = hover ?? travado;
  const maioria = Math.floor(membros.length / 2) + 1;

  const filtrados = useMemo(() => {
    const nq = norm(q.trim());
    return ordenados.filter(
      (m) => (!uf || m.uf === uf) && (!travado || m.partido === travado) && (!nq || norm(m.nome).includes(nq)),
    );
  }, [ordenados, uf, travado, q]);

  const lit = useMemo(() => {
    if (!uf && !q.trim()) return null;
    const nq = norm(q.trim());
    return new Set(ordenados.filter((m) => (!uf || m.uf === uf) && (!nq || norm(m.nome).includes(nq))).map((m) => m.id));
  }, [ordenados, uf, q]);

  const seats: Seat[] = useMemo(
    () =>
      ordenados.map((m) => ({
        key: m.id,
        color: corPartido(m.partido),
        group: m.partido,
        title: m.nome,
        sub: `${m.partido} / ${UF_NOME[m.uf] ?? m.uf}`,
        foto: m.foto,
        href: `/${casa}/parlamentares/${m.id}`,
      })),
    [ordenados, casa],
  );

  const destaque = ativo ? partidos.find((p) => p.partido === ativo) : null;
  const ufCount = uf ? membros.filter((m) => m.uf === uf).length : 0;

  return (
    <div className="space-y-6">
      <section className="panel radar-grid grid gap-6 p-4 sm:p-6 xl:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          <Hemicycle
            seats={seats}
            lit={lit}
            highlightGroup={ativo}
            onGroupHover={setHover}
            onSeatClick={(s) => s.href && router.push(s.href)}
            ariaLabel={`Distribuição das ${membros.length} cadeiras por partido`}
            center={
              <>
                <span className="font-display tnum text-[clamp(40px,8vw,84px)] font-semibold leading-none text-ink">
                  {destaque ? destaque.n : uf ? ufCount : membros.length}
                </span>
                <span className="mt-1 text-[13px] text-ink-2">
                  {destaque
                    ? `cadeiras do ${destaque.partido}`
                    : uf
                      ? `cadeiras de ${UF_NOME[uf]}`
                      : `cadeiras, maioria simples a partir de ${maioria}`}
                </span>
              </>
            }
          />
          <p className="mt-4 text-center text-[12px] text-muted">
            Passe o mouse sobre um assento ou partido para destacar. Clique num assento para abrir o perfil.
            Partidos posicionados da esquerda para a direita conforme o costume da imprensa.
          </p>
        </div>
        <div>
          <div className="mb-2 flex items-baseline justify-between px-2">
            <h2 className="font-display text-[15px] font-semibold">Partidos</h2>
            {travado && (
              <button type="button" onClick={() => setTravado(null)} className="text-[12px] text-phosphor hover:underline">
                Limpar filtro
              </button>
            )}
          </div>
          <PartyLegend
            partidos={partidos}
            total={membros.length}
            ativo={ativo}
            travado={travado}
            onHover={setHover}
            onToggle={(p) => setTravado((t) => (t === p ? null : p))}
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(280px,380px)_1fr]">
        <div className="panel p-4 sm:p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-[15px] font-semibold">Bancadas por estado</h2>
            {uf && (
              <button type="button" onClick={() => setUf(null)} className="text-[12px] text-phosphor hover:underline">
                Todos os estados
              </button>
            )}
          </div>
          <StateGrid membros={membros} uf={uf} partido={travado} onSelect={setUf} />
          <p className="mt-3 text-[12px] text-muted">
            {travado
              ? `Números mostram as cadeiras do ${travado} em cada estado.`
              : casa === "senado"
                ? "Cada estado tem 3 senadores. A faixa colorida mostra os partidos."
                : "Número de deputados por estado. A faixa colorida mostra os partidos."}
          </p>
        </div>

        <div className="panel min-w-0 p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="font-display text-[15px] font-semibold">
              {casa === "camara" ? "Deputados" : "Senadores"}
              <span className="tnum ml-2 text-[13px] font-normal text-muted">{filtrados.length}</span>
            </h2>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome"
              aria-label="Buscar parlamentar por nome"
              className="ml-auto w-full rounded-md border border-line bg-bg px-3 py-1.5 text-[13px] placeholder:text-muted sm:w-56"
            />
          </div>
          {filtrados.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-ink-2">
              Nenhum parlamentar com esses filtros. Limpe o partido, o estado ou a busca.
            </p>
          ) : (
            <ul className="grid max-h-[520px] grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2 2xl:grid-cols-3">
              {filtrados.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/${casa}/parlamentares/${m.id}`}
                    className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-panel-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.foto}
                      alt=""
                      loading="lazy"
                      width={32}
                      height={32}
                      className="h-8 w-8 shrink-0 rounded-full bg-line object-cover"
                      style={{ boxShadow: `0 0 0 2px ${corPartido(m.partido)}` }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-ink">{m.nome}</span>
                      <span className="block text-[12px] text-muted">
                        {m.partido} / {m.uf}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
