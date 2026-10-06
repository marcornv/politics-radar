import type { Gastos } from "./types";

export interface LinhaGasto {
  data: string; // YYYY-MM-DD
  categoria: string;
  fornecedor: string;
  valor: number;
}

const CATEGORIA_CURTA: [RegExp, string][] = [
  [/passage/i, "Passagens"],
  [/combust/i, "Combustíveis"],
  [/locomo|hospedagem|alimenta/i, "Locomoção, hospedagem e alimentação"],
  [/divulga/i, "Divulgação do mandato"],
  [/aluguel|escrit[óo]rio|manuten/i, "Escritório"],
  [/consultori|assessori|pesquisa|t[ée]cnico/i, "Consultorias e assessorias"],
  [/telefon|postal|correio/i, "Telefone e correios"],
  [/ve[íi]culo|loca[çc][ãa]o ou fretamento/i, "Locação de veículos"],
  [/seguran/i, "Segurança"],
  [/material|software|publica/i, "Material de escritório"],
];

export function categoriaCurta(c: string): string {
  for (const [re, label] of CATEGORIA_CURTA) if (re.test(c)) return label;
  const t = c.trim().replace(/\.$/, "").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function agregarGastos(linhas: LinhaGasto[], desde: string): Gastos {
  const doPeriodo = linhas.filter((l) => l.data >= desde);
  const cat = new Map<string, { total: number; n: number }>();
  const mes = new Map<string, number>();
  const forn = new Map<string, number>();
  let total = 0;
  for (const l of doPeriodo) {
    total += l.valor;
    const c = categoriaCurta(l.categoria);
    const e = cat.get(c) ?? { total: 0, n: 0 };
    cat.set(c, { total: e.total + l.valor, n: e.n + 1 });
    const m = l.data.slice(0, 7);
    mes.set(m, (mes.get(m) ?? 0) + l.valor);
    const f = l.fornecedor.trim() || "Não informado";
    forn.set(f, (forn.get(f) ?? 0) + l.valor);
  }
  return {
    desde,
    total,
    porCategoria: [...cat.entries()]
      .map(([categoria, v]) => ({ categoria, ...v }))
      .sort((a, b) => b.total - a.total),
    porMes: [...mes.entries()].map(([m, t]) => ({ mes: m, total: t })).sort((a, b) => a.mes.localeCompare(b.mes)),
    maioresFornecedores: [...forn.entries()]
      .map(([nome, t]) => ({ nome, total: t }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8),
  };
}
