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
  /** Why it matters to the reader described in Configurações; only when one is. */
  paraVoce?: string;
  modelo: string;
  geradoEm: string;
}

/** One line of the summary stream from `/api/resumo/[casa]/[id]` (`resumir_stream` in ia/radar_ia/resumo.py). */
export type EventoResumo =
  | { tipo: "pensando" }
  | { tipo: "texto"; delta: string }
  | { tipo: "pronto"; resumo: Resumo }
  | { tipo: "erro"; erro: string };

export const resumoDisponivel = async () => !!(await statusIA())?.ativo;

/** Props for ResumoCard: whether an AI is configured and whether "Sobre você" is filled in. */
export async function summaryOptions(): Promise<{ disponivel: boolean; temPerfil: boolean }> {
  const s = await statusIA();
  return { disponivel: !!s?.ativo, temPerfil: !!s?.leitor };
}
