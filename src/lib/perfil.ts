import * as pc from "./perfil-camara";
import * as ps from "./perfil-senado";
import type { Casa } from "./types";

export const perfil = (casa: Casa, id: string) => (casa === "camara" ? pc.perfil(id) : ps.perfil(id));
export const vinculos = (casa: Casa, id: string) => (casa === "camara" ? pc.vinculos(id) : ps.vinculos(id));
export const autoria = (casa: Casa, id: string) => (casa === "camara" ? pc.autoria(id) : ps.autoria(id));
export const emendasProjeto = (casa: Casa, id: string) =>
  casa === "camara" ? pc.emendasProjeto(id) : ps.emendasProjeto(id);
export const gastos = (casa: Casa, id: string) => (casa === "camara" ? pc.gastos(id) : ps.gastos(id));

/** Câmara index covers 120 days (one call per vote); the Senado list carries every vote, so a year is cheap. */
export const JANELA_VOTOS: Record<Casa, number> = { camara: 120, senado: 365 };
export const historicoVotos = (casa: Casa, id: string) =>
  casa === "camara" ? pc.historicoVotos(id, JANELA_VOTOS.camara) : ps.historicoVotos(id, JANELA_VOTOS.senado);
