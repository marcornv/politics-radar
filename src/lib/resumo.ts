import { statusIA } from "./ia";

/** Plain-language summary of a bill, as returned by the AI service (`ia/radar_ia/resumo.py`). */
export interface Resumo {
  /** One or two sentences, plain language. */
  sintese: string;
  /** What changes in practice, as short bullet points. */
  mudancas: string[];
  /** Who is affected. */
  afetados: string;
  /** Where it stands and what comes next. */
  proximoPasso: string;
  modelo: string;
  geradoEm: string;
}

export const resumoDisponivel = async () => !!(await statusIA())?.ativo;
