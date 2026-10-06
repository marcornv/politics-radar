"use client";

import { useMemo, useState } from "react";

export interface Seat {
  key: string;
  color: string;
  /** Seats with the same group sit together and highlight together. */
  group: string;
  title: string;
  sub?: string;
  detail?: string;
  foto?: string;
  href?: string;
  /** Draw as a ring instead of a filled dot (e.g. absent). */
  hollow?: boolean;
}

interface Props {
  seats: Seat[];
  /** Seat keys to keep lit; everything else dims. Null = all lit. */
  lit?: Set<string> | null;
  highlightGroup?: string | null;
  onGroupHover?: (g: string | null) => void;
  onSeatClick?: (s: Seat) => void;
  center?: React.ReactNode;
  animate?: boolean;
  ariaLabel: string;
  className?: string;
}

const innerFor = (n: number) => (n < 150 ? 0.44 : 0.36);

const round = (v: number) => Math.round(v * 1e4) / 1e4;

/**
 * Parliament-style layout: concentric rows whose seat count is proportional
 * to their radius, then every seat position sorted by angle so consecutive
 * seats (one party) form a wedge from left to right.
 */
function layout(n: number) {
  if (n === 0) return { pts: [] as { x: number; y: number; a: number }[], r: 0 };
  const INNER = innerFor(n);
  const rows = Math.max(2, Math.round((n < 150 ? 0.45 : 0.56) * Math.sqrt(n)));
  const radii = Array.from({ length: rows }, (_, i) => INNER + ((1 - INNER) * i) / (rows - 1));
  const total = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map((r) => Math.floor((n * r) / total));
  let rest = n - counts.reduce((a, b) => a + b, 0);
  for (let i = rows - 1; rest > 0; i = (i - 1 + rows) % rows, rest--) counts[i]++;

  const pts: { x: number; y: number; a: number; r: number }[] = [];
  radii.forEach((r, i) => {
    const c = counts[i];
    for (let j = 0; j < c; j++) {
      const a = c === 1 ? Math.PI / 2 : Math.PI - (Math.PI * j) / (c - 1);
      // Rounded so server and browser render byte-identical attributes.
      pts.push({ x: round(r * Math.cos(a)), y: round(-r * Math.sin(a)), a, r });
    }
  });
  pts.sort((p, q) => q.a - p.a || p.r - q.r);
  const spacing = (1 - INNER) / (rows - 1);
  const arcGap = (Math.PI * INNER) / Math.max(1, counts[0] - 1);
  return { pts, r: round(Math.min(spacing, arcGap) * 0.4) };
}

export function Hemicycle({
  seats,
  lit = null,
  highlightGroup = null,
  onGroupHover,
  onSeatClick,
  center,
  animate = true,
  ariaLabel,
  className = "",
}: Props) {
  const { pts, r } = useMemo(() => layout(seats.length), [seats.length]);
  const [hover, setHover] = useState<number | null>(null);
  const h = hover != null ? seats[hover] : null;
  const hp = hover != null ? pts[hover] : null;

  const isLit = (s: Seat) => {
    if (highlightGroup && s.group !== highlightGroup) return false;
    if (lit && !lit.has(s.key)) return false;
    return true;
  };

  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox="-1.06 -1.06 2.12 1.12"
        className="block w-full overflow-visible"
        role="img"
        aria-label={ariaLabel}
        onMouseLeave={() => {
          setHover(null);
          onGroupHover?.(null);
        }}
      >
        {animate && (
          <line
            className="sweep-arm"
            x1="0"
            y1="0"
            x2="0"
            y2="-1.04"
            stroke="var(--phosphor)"
            strokeWidth="0.006"
            strokeLinecap="round"
            style={{ transformBox: "view-box", transformOrigin: "0px 0px" }}
          />
        )}
        {seats.map((s, i) => {
          const p = pts[i];
          if (!p) return null;
          const on = isLit(s);
          const delay = animate ? Math.round(((Math.PI - p.a) / Math.PI) * 1100) : 0;
          return (
            <g
              key={s.key}
              onMouseEnter={() => {
                setHover(i);
                onGroupHover?.(s.group);
              }}
              onClick={() => onSeatClick?.(s)}
              style={{
                cursor: onSeatClick || s.href ? "pointer" : "default",
                opacity: on ? 1 : 0.16,
                transition: "opacity 160ms",
              }}
            >
              {/* generous invisible hit target */}
              <circle cx={p.x} cy={p.y} r={round(r * 1.45)} fill="transparent" />
              <circle
                className={animate ? "seat-in" : undefined}
                style={{ animationDelay: `${delay}ms` }}
                cx={p.x}
                cy={p.y}
                r={hover === i ? round(r * 1.35) : r}
                fill={s.hollow ? "transparent" : s.color}
                stroke={s.hollow ? s.color : hover === i ? "var(--ink)" : "none"}
                strokeWidth={round(s.hollow ? r * 0.35 : r * 0.25)}
              />
            </g>
          );
        })}
      </svg>

      {center && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center pb-[1%] text-center">
          {center}
        </div>
      )}

      {h && hp && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 w-max max-w-[240px] -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-lg border border-line-strong bg-panel-2/95 px-3 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur"
          style={{
            left: `${((hp.x + 1.06) / 2.12) * 100}%`,
            top: `${((hp.y + 1.06) / 1.12) * 100}%`,
          }}
        >
          <div className="flex items-center gap-2.5">
            {h.foto && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={h.foto} alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover bg-line" />
            )}
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-ink">{h.title}</div>
              {h.sub && <div className="text-[12px] text-ink-2">{h.sub}</div>}
            </div>
          </div>
          {h.detail && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-ink">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: h.color }} aria-hidden />
              {h.detail}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
