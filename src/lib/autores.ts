import { membros } from "./legislativo";
import type { Casa } from "./types";

export type IndiceAutores = Record<string, { casa: Casa; id: string; nome: string; partido: string; uf: string }>;

export const chaveNome = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** "Senador Alan Rick (REPUBLICANOS/AC)" → "ALAN RICK". */
export function nomeDaAutoria(a: string): string {
  return chaveNome(a.replace(/\(.*$/, "").replace(/^(senador|senadora|deputad[oa]( federal)?|l[íi]der d[oa] \S+)\s+/i, ""));
}

/** Current members of both houses keyed by normalised parliamentary name. */
export async function indiceAutores(): Promise<IndiceAutores> {
  const [c, s] = await Promise.all([membros("camara").catch(() => []), membros("senado").catch(() => [])]);
  const out: IndiceAutores = {};
  for (const [casa, lista] of [
    ["camara", c],
    ["senado", s],
  ] as const) {
    for (const m of lista) out[chaveNome(m.nome)] = { casa, id: m.id, nome: m.nome, partido: m.partido, uf: m.uf };
  }
  return out;
}
