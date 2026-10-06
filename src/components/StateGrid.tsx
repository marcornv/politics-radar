"use client";

import { corPartido, ordemPartido, UF_GRID, UF_NOME, UFS } from "@/lib/partidos";
import type { Parlamentar } from "@/lib/types";

interface Props {
  membros: Parlamentar[];
  uf: string | null;
  partido: string | null;
  onSelect: (uf: string | null) => void;
}

/**
 * Brazil as a tile grid. Each tile carries the state's delegation as a
 * stacked strip of party colours; with a party selected, the tile shows that
 * party's seats in the state instead.
 */
export function StateGrid({ membros, uf, partido, onSelect }: Props) {
  const porUf = new Map<string, Parlamentar[]>();
  for (const m of membros) porUf.set(m.uf, [...(porUf.get(m.uf) ?? []), m]);

  return (
    <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Bancada por estado">
      {UFS.map((u) => {
        const [col, row] = UF_GRID[u];
        const lista = porUf.get(u) ?? [];
        const doPartido = partido ? lista.filter((m) => m.partido === partido).length : null;
        const contagem = new Map<string, number>();
        for (const m of lista) contagem.set(m.partido, (contagem.get(m.partido) ?? 0) + 1);
        const strip = [...contagem.entries()].sort((a, b) => ordemPartido(a[0]) - ordemPartido(b[0]));
        const sel = uf === u;
        const apagado = (uf && !sel) || doPartido === 0;
        return (
          <button
            key={u}
            type="button"
            onClick={() => onSelect(sel ? null : u)}
            aria-pressed={sel}
            title={`${UF_NOME[u]}: ${lista.length} ${lista.length === 1 ? "cadeira" : "cadeiras"}`}
            style={{ gridColumn: col + 1, gridRow: row + 1 }}
            className={`group relative flex aspect-square flex-col justify-between overflow-hidden rounded-md border p-1.5 text-left transition-[border-color,opacity] ${
              sel ? "border-phosphor bg-panel-2" : "border-line bg-panel hover:border-line-strong"
            } ${apagado ? "opacity-40" : ""}`}
          >
            <span className="font-display text-[11px] font-semibold leading-none text-ink-2 sm:text-[12px]">{u}</span>
            <span className="tnum font-display text-[15px] leading-none text-ink sm:text-[18px]">
              {doPartido ?? lista.length}
            </span>
            <span className="absolute inset-x-0 bottom-0 flex h-[3px] gap-px" aria-hidden>
              {strip.map(([p, n]) => (
                <span
                  key={p}
                  style={{
                    flexGrow: n,
                    background: corPartido(p),
                    opacity: partido && p !== partido ? 0.15 : 1,
                  }}
                />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
