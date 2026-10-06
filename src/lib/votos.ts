import type { TipoVoto } from "./types";

export const VOTO_INFO: Record<TipoVoto, { label: string; cor: string; hollow?: boolean }> = {
  sim: { label: "Sim", cor: "#3f8fea" },
  nao: { label: "Não", cor: "#e66767" },
  abstencao: { label: "Abstenção", cor: "#9aa6bd" },
  obstrucao: { label: "Obstrução", cor: "#c98500" },
  presidente: { label: "Presidente", cor: "#b8f2e6" },
  votou: { label: "Votou (secreto)", cor: "#7d8aa3" },
  ausente: { label: "Não votou", cor: "#4a5a7a", hollow: true },
};

export const ORDEM_VOTOS: TipoVoto[] = ["sim", "nao", "abstencao", "obstrucao", "presidente", "votou", "ausente"];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Map an orientation label ("Sim", "SIM", "Liberado", "Obstrução") onto a vote type, if any. */
export function votoDaOrientacao(o: string): TipoVoto | null {
  const s = norm(o);
  if (s === "sim") return "sim";
  if (s === "nao") return "nao";
  if (s.startsWith("absten")) return "abstencao";
  if (s.startsWith("obstru")) return "obstrucao";
  return null;
}

const ALIAS: Record<string, string[]> = {
  PODE: ["podemos"],
  "UNIÃO": ["uniao", "união", "uniao brasil"],
  REPUBLICANOS: ["republicanos", "repub"],
  PCdoB: ["pcdob"],
  SOLIDARIEDADE: ["solidariedade", "solid"],
};

/**
 * Find the orientation that applies to a party. Câmara publishes some per
 * party and some per bloc or federation ("Fdr PT-PCdoB-PV"), so a party also
 * matches any bloc label that names it.
 */
export function orientacaoDoPartido(partido: string, orientacoes: { bancada: string; orientacao: string }[]) {
  const nomes = [norm(partido), ...(ALIAS[partido] ?? [])];
  const exata = orientacoes.find((o) => nomes.includes(norm(o.bancada)));
  if (exata) return exata;
  return orientacoes.find((o) => {
    const tokens = norm(o.bancada).split(/[^a-z0-9ãçéêíóôõú]+/);
    return nomes.some((n) => tokens.includes(n));
  });
}
