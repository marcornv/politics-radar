import Link from "next/link";
import { formatDayLong, formatTime, hasTime } from "@/lib/dates";
import type { Casa, EventoAgenda } from "@/lib/types";

/** Upcoming deliberative sessions and the items on their agenda. */
export function PautaPrevista({ casa, eventos }: { casa: Casa; eventos: EventoAgenda[] }) {
  if (eventos.length === 0) {
    return (
      <div className="panel p-8 text-center text-[14px] text-ink-2">
        Nenhuma sessão deliberativa com pauta publicada para os próximos 14 dias. As pautas costumam sair na semana da
        votação; confira a{" "}
        <Link href="/agenda" className="text-phosphor hover:underline">
          agenda da semana
        </Link>
        .
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {eventos.map((e) => (
        <section key={e.id} className="panel overflow-hidden">
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-4 py-3">
            <span className="inline-block font-display text-[15px] font-semibold first-letter:uppercase text-ink">
              {formatDayLong(e.inicio)}
              {hasTime(e.inicio) && <span className="tnum font-normal text-ink-2">, {formatTime(e.inicio)}</span>}
            </span>
            <span className="text-[13px] text-ink-2">{e.orgaoNome ?? e.orgao}</span>
            <span className="ml-auto text-[12px] text-muted">{e.pauta.length} {e.pauta.length === 1 ? "item" : "itens"} na pauta</span>
          </header>
          <ol className="divide-y divide-line">
            {e.pauta.map((it, i) => {
              const inner = (
                <>
                  <span className="tnum w-6 shrink-0 text-[12px] text-muted">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{it.titulo}</span>
                    {it.ementa && <span className="mt-0.5 line-clamp-2 text-[13px] text-ink-2">{it.ementa}</span>}
                    {it.relator && <span className="mt-0.5 block text-[12px] text-muted">Relator: {it.relator}</span>}
                  </span>
                </>
              );
              return (
                <li key={i}>
                  {it.proposicaoId ? (
                    <Link
                      href={`/${casa}/proposicoes/${it.proposicaoId}`}
                      className="flex gap-3 px-4 py-2.5 text-[14px] hover:bg-panel-2"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex gap-3 px-4 py-2.5 text-[14px]">{inner}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
