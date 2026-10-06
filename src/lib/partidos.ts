/**
 * Seat order around the hemicycle, roughly left → right as commonly drawn by
 * the Brazilian press. It only positions seats; it is not an editorial claim.
 * Unknown parties land in the centre.
 */
const ORDEM = [
  "PSOL",
  "REDE",
  "PCdoB",
  "PT",
  "PV",
  "PSB",
  "PDT",
  "SOLIDARIEDADE",
  "CIDADANIA",
  "AVANTE",
  "PSDB",
  "MDB",
  "PSD",
  "PODE",
  "DC",
  "PRD",
  "AGIR",
  "PMB",
  "MOBILIZA",
  "REPUBLICANOS",
  "UNIÃO",
  "PP",
  "PL",
  "NOVO",
  "MISSÃO",
  "S/Partido",
];

/**
 * The eight largest parties get a categorical hue. Assignment follows seat
 * order on the arc and was validated (dataviz validate_palette.js, dark
 * surface #0f1a2e) so neighbouring wedges stay apart for colour-blind readers.
 * Smaller parties alternate between two neutral tones; their identity comes
 * from the legend, hover and labels, never colour alone.
 */
const CORES: Record<string, string> = {
  PT: "#e66767",
  MDB: "#199e70",
  PSD: "#d95926",
  PODE: "#9085e9",
  REPUBLICANOS: "#c98500",
  "UNIÃO": "#008300",
  PP: "#d55181",
  PL: "#3987e5",
};

const NEUTRAS = ["#5d6b86", "#7d8aa3"];

export function ordemPartido(sigla: string): number {
  const i = ORDEM.indexOf(sigla);
  return i === -1 ? ORDEM.indexOf("PRD") + 0.5 : i;
}

export function corPartido(sigla: string): string {
  if (CORES[sigla]) return CORES[sigla];
  const i = ORDEM.indexOf(sigla);
  return NEUTRAS[(i === -1 ? 0 : i) % 2];
}

export function temCorPropria(sigla: string): boolean {
  return sigla in CORES;
}

/** Normalise party labels that differ between the two APIs. */
export function normalizarPartido(s: string | undefined | null): string {
  if (!s) return "S/Partido";
  const t = s.trim();
  const map: Record<string, string> = {
    UNIAO: "UNIÃO",
    "UNIÃO BRASIL": "UNIÃO",
    PODEMOS: "PODE",
    Solidariedade: "SOLIDARIEDADE",
    SD: "SOLIDARIEDADE",
    "S/PARTIDO": "S/Partido",
    "SEM PARTIDO": "S/Partido",
    Republicanos: "REPUBLICANOS",
    PCDOB: "PCdoB",
    Cidadania: "CIDADANIA",
    MISSAO: "MISSÃO",
  };
  return map[t] ?? map[t.toUpperCase()] ?? t;
}

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export const UF_NOME: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará",
  DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão",
  MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará",
  PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
  SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

/** Tile-grid positions [col, row] approximating Brazil's map. */
export const UF_GRID: Record<string, [number, number]> = {
  RR: [2, 0], AP: [4, 0],
  AM: [1, 1], PA: [3, 1], MA: [4, 1], CE: [5, 1], RN: [6, 1],
  AC: [0, 2], RO: [1, 2], TO: [3, 2], PI: [4, 2], PB: [6, 2], PE: [5, 2],
  MT: [2, 2], BA: [4, 3], AL: [6, 3], SE: [5, 3],
  GO: [3, 3], DF: [3, 4], MG: [4, 4], ES: [5, 4], MS: [2, 3],
  SP: [3, 5], RJ: [4, 5], PR: [2, 5],
  SC: [2, 6], RS: [1, 6],
};
