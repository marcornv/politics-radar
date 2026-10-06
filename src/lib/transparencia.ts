import { cached, HOUR } from "./cache";
import { chave as lerChave } from "./config";
import { UpstreamError } from "./http";
import type { EmendaOrcamento, StatusOrcamento } from "./types";

const BASE = "https://api.portaldatransparencia.gov.br/api-de-dados";

export const transparenciaDisponivel = () => !!lerChave("TRANSPARENCIA_API_KEY");

export class ChaveRecusada extends Error {}

// The portal allows 90 requests per minute during the day; keep a gap between calls.
let fila: Promise<void> = Promise.resolve();
const INTERVALO_MS = 700;

function aguardarVez(): Promise<void> {
  const vez = fila.then(() => new Promise<void>((r) => setTimeout(r, INTERVALO_MS)));
  fila = vez;
  return vez;
}

async function getPT<T>(path: string): Promise<T> {
  const chave = lerChave("TRANSPARENCIA_API_KEY");
  if (!chave) throw new ChaveRecusada("Nenhuma chave do Portal da Transparência configurada.");
  await aguardarVez();
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "chave-api-dados": chave },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) throw new ChaveRecusada("O Portal da Transparência recusou a chave.");
  if (!res.ok) throw new UpstreamError(url, res.status);
  return (await res.json()) as T;
}

/** Accepts "1.234.567,89", "1234567.89" or a number. */
export function valorBR(v: string | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const s = v.trim();
  if (!s) return 0;
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? n : 0;
}

type Raw = {
  codigoEmenda: string;
  ano: number;
  tipoEmenda: string;
  autor: string;
  nomeAutor: string;
  numeroEmenda: string;
  localidadeDoGasto: string;
  funcao: string;
  subfuncao: string;
  valorEmpenhado: string;
  valorLiquidado: string;
  valorPago: string;
  valorRestoPago: string;
};

export function statusDe(empenhado: number, liquidado: number, pago: number): StatusOrcamento {
  if (empenhado <= 0 && pago <= 0) return "sem_execucao";
  if (pago > 0 && pago >= empenhado * 0.999) return "paga";
  if (pago > 0) return "paga_parcial";
  if (liquidado > 0) return "liquidada";
  return "empenhada";
}

function mapear(r: Raw): EmendaOrcamento {
  const empenhado = valorBR(r.valorEmpenhado);
  const liquidado = valorBR(r.valorLiquidado);
  const pago = valorBR(r.valorPago) + valorBR(r.valorRestoPago);
  return {
    codigo: r.codigoEmenda,
    ano: r.ano,
    tipo: r.tipoEmenda,
    autor: r.nomeAutor || r.autor,
    numero: r.numeroEmenda,
    localidade: r.localidadeDoGasto,
    funcao: r.funcao,
    subfuncao: r.subfuncao,
    empenhado,
    liquidado,
    pago,
    status: statusDe(empenhado, liquidado, pago),
  };
}

export interface ConsultaEmendas {
  ano: number;
  autor?: string;
  tipo?: string;
}

/**
 * All pages for a query, up to `maxPaginas`. The API has no status filter,
 * so "concluída" (fully paid) is decided locally from the amounts.
 */
export function buscarEmendas(q: ConsultaEmendas, maxPaginas = 10): Promise<{ itens: EmendaOrcamento[]; truncado: boolean }> {
  const key = `pt:emendas:${q.ano}:${q.autor ?? ""}:${q.tipo ?? ""}:${maxPaginas}`;
  return cached(key, 24 * HOUR, async () => {
    const itens: EmendaOrcamento[] = [];
    let truncado = false;
    for (let pagina = 1; pagina <= maxPaginas; pagina++) {
      const params = new URLSearchParams({ ano: String(q.ano), pagina: String(pagina) });
      if (q.autor) params.set("nomeAutor", q.autor);
      if (q.tipo) params.set("tipoEmenda", q.tipo);
      const page = await getPT<Raw[]>(`/emendas?${params}`);
      itens.push(...page.map(mapear));
      if (page.length === 0) break;
      if (pagina === maxPaginas) truncado = true;
    }
    return { itens, truncado };
  });
}

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();

/**
 * Budget amendments authored by a member. The portal indexes authors by an
 * upper-case name that usually matches the parliamentary name, sometimes the
 * civil one, so both are tried.
 */
export async function emendasDoParlamentar(
  nomes: string[],
  anos: number[],
): Promise<{ itens: EmendaOrcamento[]; nomeUsado?: string }> {
  for (const nome of [...new Set(nomes.filter(Boolean).map(semAcento))]) {
    const porAno = await Promise.all(anos.map((ano) => buscarEmendas({ ano, autor: nome }, 6)));
    const itens = porAno.flatMap((r) => r.itens);
    if (itens.length) return { itens, nomeUsado: nome };
  }
  return { itens: [] };
}
