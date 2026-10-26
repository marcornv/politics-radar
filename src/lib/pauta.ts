import "server-only";
import { addDays, today } from "./dates";
import { agenda } from "./legislativo";
import type { Casa, EventoAgenda } from "./types";

/** Deliberative sessions in the next 14 days that have a published agenda and haven't happened. */
export async function upcomingSessions(casa: Casa): Promise<EventoAgenda[]> {
  const de = today();
  const evs = await agenda(casa, de, addDays(de, 14));
  return evs.filter(
    (e) => e.deliberativo && e.pauta.length > 0 && !/encerrad|cancelad|realizada|n[ãa]o realizada/i.test(e.situacao),
  );
}

export interface UpcomingItem {
  key: string;
  titulo: string;
  ementa?: string;
  proposicaoId?: string;
  /** First session where the item is on the agenda. */
  inicio: string;
  orgao: string;
}

/** One entry per bill: the same one often sits on several agendas (committee, then plenary). */
export function agendaItems(casa: Casa, sessions: EventoAgenda[]): UpcomingItem[] {
  const porChave = new Map<string, UpcomingItem>();
  for (const e of [...sessions].sort((a, b) => (a.inicio < b.inicio ? -1 : 1))) {
    for (const it of e.pauta) {
      const key = `${casa}:${it.proposicaoId ?? it.titulo}`;
      if (porChave.has(key)) continue;
      porChave.set(key, {
        key,
        titulo: it.titulo,
        ementa: it.ementa,
        proposicaoId: it.proposicaoId,
        inicio: e.inicio,
        orgao: e.orgaoNome ?? e.orgao,
      });
    }
  }
  return [...porChave.values()];
}
