import Anthropic from "@anthropic-ai/sdk";
import { cached, HOUR } from "./cache";
import { chave } from "./config";
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

export const resumoDisponivel = () =>
  !!(chave("ANTHROPIC_API_KEY") || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

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

/** Plain-language summary of a bill, generated once and cached for a week. */
export function resumir(p: ProposicaoDetalhe): Promise<Resumo> {
  return cached(`resumo:${MODEL}:${p.casa}:${p.id}:${p.situacao}`, 7 * 24 * HOUR, async () => {
    const apiKey = chave("ANTHROPIC_API_KEY");
    const client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: `Resuma esta proposição:\n\n${contexto(p)}` }],
    });
    if (res.stop_reason === "refusal") throw new Error("O modelo não gerou resumo para esta proposição.");
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("Resposta sem texto.");
    const data = JSON.parse(text.text) as Omit<Resumo, "modelo" | "geradoEm">;
    return { ...data, modelo: res.model, geradoEm: new Date().toISOString() };
  });
}
