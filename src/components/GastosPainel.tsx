"use client";

import { useState } from "react";
import { formatBRL, formatBRLCompacto } from "@/lib/orcamento";
import type { Gastos } from "@/lib/types";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesLabel = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

export function GastosPainel({ g, fonte }: { g: Gastos; fonte: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (g.total === 0) {
    return (
      <p className="panel p-6 text-[14px] text-ink-2">
        Nenhuma despesa da cota parlamentar publicada nos últimos 12 meses.
      </p>
    );
  }
  const maxMes = Math.max(...g.porMes.map((m) => m.total), 1);
  const maxCat = g.porCategoria[0]?.total || 1;
  const media = g.total / Math.max(1, g.porMes.length);
  const h = hover != null ? g.porMes[hover] : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="panel p-4">
          <div className="text-[12px] text-ink-2">Total nos últimos 12 meses</div>
          <div className="font-display tnum mt-1 text-[32px] font-semibold leading-none">{formatBRL(g.total)}</div>
          <div className="tnum mt-1 text-[12.5px] text-muted">média de {formatBRL(media)} por mês com despesa</div>
        </div>
        <div className="panel p-4">
          <div className="mb-2 flex items-baseline justify-between text-[12px] text-ink-2">
            <span>Por mês</span>
            <span className="tnum text-ink">{h ? `${mesLabel(h.mes)}: ${formatBRL(h.total)}` : ""}</span>
          </div>
          <div className="flex h-24 items-end gap-1" onMouseLeave={() => setHover(null)} role="img" aria-label="Gastos por mês">
            {g.porMes.map((m, i) => (
              <div
                key={m.mes}
                className="flex h-full flex-1 flex-col justify-end"
                onMouseEnter={() => setHover(i)}
                title={`${mesLabel(m.mes)}: ${formatBRL(m.total)}`}
              >
                <div
                  className="rounded-t-[4px] transition-colors"
                  style={{
                    height: `${Math.max(2, (m.total / maxMes) * 100)}%`,
                    background: hover === i ? "var(--phosphor)" : "var(--phosphor-dim)",
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1 text-[10.5px] text-muted">
            {g.porMes.map((m, i) => (
              <span key={m.mes} className="flex-1 text-center">
                {i % 2 === 0 ? mesLabel(m.mes).slice(0, 3) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <h3 className="mb-3 font-display text-[14px] font-semibold">Por tipo de despesa</h3>
          <ul className="space-y-2.5">
            {g.porCategoria.map((c) => (
              <li key={c.categoria} className="text-[13px]">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink">{c.categoria}</span>
                  <span className="tnum shrink-0 text-ink">
                    {formatBRLCompacto(c.total)} <span className="text-[11.5px] text-muted">{Math.round((c.total / g.total) * 100)}%</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-line" aria-hidden>
                  <div className="h-full rounded-full bg-phosphor-dim" style={{ width: `${(c.total / maxCat) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel p-4">
          <h3 className="mb-3 font-display text-[14px] font-semibold">Maiores fornecedores</h3>
          <ol className="divide-y divide-line text-[13px]">
            {g.maioresFornecedores.map((f) => (
              <li key={f.nome} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate text-ink" title={f.nome}>
                  {f.nome}
                </span>
                <span className="tnum shrink-0 text-ink-2">{formatBRL(f.total)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <p className="text-[12px] text-muted">Fonte: {fonte}. Valores reembolsados, já descontadas glosas.</p>
    </div>
  );
}
