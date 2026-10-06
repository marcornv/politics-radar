import { cached, HOUR } from "./cache";
import { ErroIA, gerarJson, modeloDe, provedorAtivo } from "./ia";
import type { ProposicaoDetalhe } from "./types";

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

export const resumoDisponivel = () => provedorAtivo() !== null;

const SYSTEM = `Você explica proposições do Congresso brasileiro para um cidadão bem informado, mas que não é jurista.
Escreva em português do Brasil, linguagem simples e direta, sem juridiquês e sem opinião política.
Baseie-se apenas nos dados fornecidos. Se a ementa for vaga, diga o que dá para afirmar e não invente efeitos.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sintese", "mudancas", "afetados", "proximoPasso"],
  properties: {
    sintese: { type: "string", description: "Uma ou duas frases dizendo o que a proposta faz." },
    mudancas: {
      type: "array",
      items: { type: "string" },
      description: "De 2 a 4 itens curtos com o que muda na prática.",
    },
    afetados: { type: "string", description: "Quem é afetado, em uma frase." },
    proximoPasso: {
      type: "string",
      description: "Em que fase está e qual o próximo passo provável, em uma frase.",
    },
  },
};

function contexto(p: ProposicaoDetalhe): string {
  const ultimas = p.tramitacoes
    .slice(0, 6)
    .map((t) => `- ${t.data.slice(0, 10)} [${t.orgao}] ${t.descricao}${t.despacho ? `: ${t.despacho}` : ""}`)
    .join("\n");
  return [
    `Casa: ${p.casa === "camara" ? "Câmara dos Deputados" : "Senado Federal"}`,
    `Proposição: ${p.sigla} (${p.tipo})`,
    p.autoria && `Autoria: ${p.autoria}`,
    `Ementa: ${p.ementa}`,
    p.ementaDetalhada && `Ementa detalhada: ${p.ementaDetalhada}`,
    p.keywords && `Indexação: ${p.keywords}`,
    `Situação atual: ${p.situacao} (órgão: ${p.orgao})`,
    p.regime && `Regime: ${p.regime}`,
    p.relator && `Relator: ${p.relator}`,
    ultimas && `Últimas movimentações:\n${ultimas}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const texto = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** Providers without strict structured outputs can drift from the schema; reject anything the card can't show. */
function validar(d: unknown): Omit<Resumo, "modelo" | "geradoEm"> {
  const r = d as Partial<Record<keyof Resumo, unknown>> | null;
  if (r && texto(r.sintese) && texto(r.afetados) && texto(r.proximoPasso) && Array.isArray(r.mudancas) && r.mudancas.every(texto)) {
    return { sintese: r.sintese, mudancas: r.mudancas, afetados: r.afetados, proximoPasso: r.proximoPasso };
  }
  throw new ErroIA("outro", "A IA devolveu um resumo incompleto. Tente de novo ou use outro modelo.");
}

/** Plain-language summary of a bill, generated once per provider and model and cached for a week. */
export async function resumir(p: ProposicaoDetalhe): Promise<Resumo> {
  const provedor = provedorAtivo();
  if (!provedor) throw new ErroIA("outro", "Nenhuma IA configurada.");
  return cached(`resumo:${provedor}:${modeloDe(provedor)}:${p.casa}:${p.id}:${p.situacao}`, 7 * 24 * HOUR, async () => {
    const { dados, modelo } = await gerarJson(provedor, {
      system: SYSTEM,
      user: `Resuma esta proposição:\n\n${contexto(p)}`,
      schema: SCHEMA,
    });
    return { ...validar(dados), modelo, geradoEm: new Date().toISOString() };
  });
}
