"use client";

import { corPartido } from "@/lib/partidos";

export interface PartyCount {
  partido: string;
  n: number;
}

interface Props {
  partidos: PartyCount[];
  total: number;
  ativo: string | null;
  travado: string | null;
  onHover: (p: string | null) => void;
  onToggle: (p: string) => void;
}

export function PartyLegend({ partidos, total, ativo, travado, onHover, onToggle }: Props) {
  const max = Math.max(...partidos.map((p) => p.n), 1);
  return (
    <ul className="space-y-px" onMouseLeave={() => onHover(null)}>
      {partidos.map((p) => {
        const on = ativo === p.partido;
        const dim = ativo && !on;
        return (
          <li key={p.partido}>
            <button
              type="button"
              onMouseEnter={() => onHover(p.partido)}
              onFocus={() => onHover(p.partido)}
              onBlur={() => onHover(null)}
              onClick={() => onToggle(p.partido)}
              aria-pressed={travado === p.partido}
              className={`grid w-full grid-cols-[10px_1fr_auto] items-center gap-x-2.5 rounded-md px-2 py-1 text-left transition-[background,opacity] ${
                on ? "bg-panel-2" : "hover:bg-panel-2/60"
              } ${dim ? "opacity-45" : ""}`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: corPartido(p.partido) }} aria-hidden />
              <span className="min-w-0">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-ink">{p.partido}</span>
                </span>
                <span className="mt-0.5 block h-[3px] rounded-full bg-line">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(p.n / max) * 100}%`, background: corPartido(p.partido) }}
                  />
                </span>
              </span>
              <span className="tnum w-14 text-right text-[13px] text-ink-2">
                <span className="text-ink">{p.n}</span>{" "}
                <span className="text-[11px] text-muted">{Math.round((p.n / total) * 100)}%</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
