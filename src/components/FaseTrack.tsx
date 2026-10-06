import { FASES } from "@/lib/fase";
import type { Fase } from "@/lib/types";

/** The legislative path as a stepped track, current stage lit. */
export function FaseTrack({ fase, situacao }: { fase: Fase; situacao: string }) {
  const passos = FASES.filter((f) => f.id !== "concluida");
  const concluida = fase === "concluida";
  const idx = concluida ? passos.length : passos.findIndex((f) => f.id === fase);

  return (
    <div>
      <ol className="grid grid-cols-5 gap-1.5" aria-label="Fases do processo legislativo">
        {passos.map((f, i) => {
          const atual = i === idx;
          const feito = i < idx;
          return (
            <li key={f.id} aria-current={atual ? "step" : undefined} className="min-w-0">
              <div
                className={`h-1.5 rounded-full ${atual ? "bg-phosphor" : feito ? "bg-phosphor-dim" : "bg-line"}`}
                aria-hidden
              />
              <span
                className={`mt-2 block truncate text-[12px] ${atual ? "font-semibold text-ink" : feito ? "text-ink-2" : "text-muted"}`}
              >
                {f.label}
              </span>
            </li>
          );
        })}
      </ol>
      {concluida && (
        <p className="mt-2 text-[13px] text-ink-2">
          Tramitação encerrada: <span className="text-ink">{situacao}</span>.
        </p>
      )}
    </div>
  );
}
