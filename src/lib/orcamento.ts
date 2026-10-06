import type { StatusOrcamento } from "./types";

export const STATUS_ORCAMENTO: Record<StatusOrcamento, { label: string; cor: string }> = {
  paga: { label: "Paga", cor: "#b8f2e6" },
  paga_parcial: { label: "Paga em parte", cor: "#5fae9f" },
  liquidada: { label: "Liquidada", cor: "#3f7d80" },
  empenhada: { label: "Empenhada", cor: "#2f5a63" },
  sem_execucao: { label: "Sem execução", cor: "#4a5a7a" },
};

export const TIPOS_EMENDA_ORCAMENTO = [
  "Emenda Individual - Transferências com Finalidade Definida",
  "Emenda Individual - Transferências Especiais",
  "Emenda de Bancada",
  "Emenda de Comissão",
  "Emenda de Relator",
];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brlCompacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export const formatBRL = (v: number) => brl.format(v);
/** "R$ 1,2 mi" style for tight spaces. */
export const formatBRLCompacto = (v: number) => `R$ ${brlCompacto.format(v)}`;
