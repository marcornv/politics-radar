import * as camara from "./camara";
import * as senado from "./senado";
import type { Casa } from "./types";

export const membros = (casa: Casa) => (casa === "camara" ? camara.deputados() : senado.senadores());

export const votacoes = (casa: Casa, de: string, ate: string) =>
  casa === "camara" ? camara.votacoes(de, ate) : senado.votacoes(de, ate);

export const votacao = (casa: Casa, id: string) => (casa === "camara" ? camara.votacao(id) : senado.votacao(id));

export const agenda = (casa: Casa, de: string, ate: string) =>
  casa === "camara" ? camara.agenda(de, ate) : senado.agenda(de, ate);

export const emTramitacao = (casa: Casa, dias: number) =>
  casa === "camara" ? camara.emTramitacao(dias) : senado.emTramitacao(dias);

export const proposicao = (casa: Casa, id: string) =>
  casa === "camara" ? camara.proposicao(id) : senado.proposicao(id);

export const comissoes = (casa: Casa) => (casa === "camara" ? camara.comissoes() : senado.comissoes());

export const TOTAL_CADEIRAS: Record<Casa, number> = { camara: 513, senado: 81 };
