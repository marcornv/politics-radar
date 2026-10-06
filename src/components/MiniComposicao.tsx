"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { corPartido, temCorPropria, UF_NOME } from "@/lib/partidos";
import type { Casa, Parlamentar } from "@/lib/types";
import { contarPartidos, ordenarMembros } from "./ComposicaoExplorer";
import { Hemicycle, type Seat } from "./Hemicycle";

export function MiniComposicao({ casa, membros }: { casa: Casa; membros: Parlamentar[] }) {
  const router = useRouter();
  const [hover, setHover] = useState<string | null>(null);
  const ordenados = useMemo(() => ordenarMembros(membros), [membros]);
  const partidos = useMemo(() => contarPartidos(membros), [membros]);
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
  const principais = partidos.filter((p) => temCorPropria(p.partido));
  const outros = partidos.filter((p) => !temCorPropria(p.partido));
  const nOutros = outros.reduce((a, p) => a + p.n, 0);
  const ativo = hover ? partidos.find((p) => p.partido === hover) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[18px] font-semibold">{casa === "camara" ? "Câmara dos Deputados" : "Senado Federal"}</h2>
        <Link href={`/${casa}`} className="text-[13px] text-phosphor hover:underline">
          Explorar
        </Link>
      </div>
      <Hemicycle
        seats={seats}
        highlightGroup={hover}
        onGroupHover={setHover}
        onSeatClick={(s) => s.href && router.push(s.href)}
        ariaLabel={`Composição ${casa === "camara" ? "da Câmara" : "do Senado"} por partido`}
        center={
          <>
            <span className="font-display tnum text-[clamp(32px,5vw,56px)] font-semibold leading-none">
              {ativo ? ativo.n : membros.length}
            </span>
            <span className="mt-0.5 text-[12px] text-ink-2">{ativo ? ativo.partido : "cadeiras"}</span>
          </>
        }
      />
      <ul className="mt-4 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12.5px]" onMouseLeave={() => setHover(null)}>
        {principais.map((p) => (
          <li key={p.partido}>
            <button
              type="button"
              onMouseEnter={() => setHover(p.partido)}
              onFocus={() => setHover(p.partido)}
              onBlur={() => setHover(null)}
              className={`flex items-center gap-1.5 ${hover && hover !== p.partido ? "opacity-45" : ""}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: corPartido(p.partido) }} aria-hidden />
              <span className="text-ink">{p.partido}</span>
              <span className="tnum text-ink-2">{p.n}</span>
            </button>
          </li>
        ))}
        {nOutros > 0 && (
          <li className="flex items-center gap-1.5 text-ink-2">
            <span className="h-2 w-2 rounded-full bg-[#6b7a96]" aria-hidden />
            outros {outros.length} partidos <span className="tnum">{nOutros}</span>
          </li>
        )}
      </ul>
    </div>
  );
}
