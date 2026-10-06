import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { chave, type NomeChave } from "./config";

/** AI providers that can write the plain-language summaries. */
export const PROVEDORES = ["anthropic", "openai", "groq", "compativel"] as const;
export type Provedor = (typeof PROVEDORES)[number];

export const ehProvedor = (v: unknown): v is Provedor => PROVEDORES.includes(v as Provedor);

// All provider names are feminine in Portuguese ("a OpenAI", "a Groq"), so one contraction fits all.
export const NOME_PROVEDOR: Record<Provedor, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  groq: "Groq",
  compativel: "API compatível",
};

export const CHAVE_DO_PROVEDOR: Record<Provedor, NomeChave> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  groq: "GROQ_API_KEY",
  compativel: "COMPATIVEL_API_KEY",
};

const BASE: Record<"openai" | "groq", string> = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
};

export function modeloDe(p: Provedor): string {
  if (p === "anthropic") return process.env.CLAUDE_MODEL || "claude-opus-5-5";
  if (p === "openai") return process.env.OPENAI_MODEL || "gpt-6-luna";
  if (p === "groq") return process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  return chave("COMPATIVEL_MODELO") ?? "";
}

/** Claude Code / `ant` login on this machine, used when no Anthropic key is set. */
export const loginClaude = () => !!(process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);

export function configurado(p: Provedor): boolean {
  if (p === "anthropic") return !!chave("ANTHROPIC_API_KEY") || loginClaude();
  if (p === "compativel") return !!(chave("COMPATIVEL_URL") && chave("COMPATIVEL_MODELO"));
  return !!chave(CHAVE_DO_PROVEDOR[p]);
}

export const provedoresConfigurados = () => PROVEDORES.filter(configurado);

/** The provider chosen in Configurações, or the first configured one if that choice is gone. */
export function provedorAtivo(): Provedor | null {
  const escolhido = chave("IA_PROVEDOR");
  if (ehProvedor(escolhido) && configurado(escolhido)) return escolhido;
  return provedoresConfigurados()[0] ?? null;
}

/** Provider failure in a shape the API route can explain, whatever SDK or endpoint produced it. */
export class ErroIA extends Error {
  constructor(
    public tipo: "chave" | "limite" | "outro",
    msg: string,
    public status?: number,
  ) {
    super(msg);
  }
}

interface Pedido {
  system: string;
  user: string;
  schema: Record<string, unknown>;
}

export interface Gerado {
  dados: unknown;
  modelo: string;
}

export function gerarJson(p: Provedor, pedido: Pedido): Promise<Gerado> {
  return p === "anthropic" ? viaAnthropic(pedido) : viaOpenAI(p, pedido);
}

/** Parses the model's JSON, tolerating text around it (local models often add a preamble or a <think> block). */
function lerJson(bruto: string | null | undefined): unknown {
  const texto = bruto
    ?.replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/```(?:json)?/g, "")
    .trim();
  if (texto) {
    try {
      return JSON.parse(texto);
    } catch {
      const i = texto.indexOf("{");
      const f = texto.lastIndexOf("}");
      if (i >= 0 && f > i) {
        try {
          return JSON.parse(texto.slice(i, f + 1));
        } catch {}
      }
    }
  }
  throw new ErroIA("outro", "A IA devolveu uma resposta fora do formato esperado.");
}

const RECUSA = "O modelo não gerou resumo para esta proposição.";

async function viaAnthropic({ system, user, schema }: Pedido): Promise<Gerado> {
  const apiKey = chave("ANTHROPIC_API_KEY");
  const client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
  try {
    const res = await client.beta.messages.create({
      model: modeloDe("anthropic"),
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      system,
      messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal") throw new ErroIA("outro", RECUSA);
    const text = res.content.find((b) => b.type === "text");
    return { dados: lerJson(text?.type === "text" ? text.text : null), modelo: res.model };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      throw new ErroIA("chave", "Chave recusada.", e.status);
    }
    if (e instanceof Anthropic.RateLimitError) throw new ErroIA("limite", "Limite de uso atingido.", 429);
    if (e instanceof Anthropic.APIError) throw new ErroIA("outro", `A Anthropic respondeu com erro ${e.status}.`, e.status);
    throw e;
  }
}

function baseDe(p: Exclude<Provedor, "anthropic">, url?: string): string {
  return p === "compativel" ? (url ?? chave("COMPATIVEL_URL") ?? "").replace(/\/+$/, "") : BASE[p];
}

function cabecalhos(chaveApi: string | undefined): Record<string, string> {
  return { "Content-Type": "application/json", ...(chaveApi ? { Authorization: `Bearer ${chaveApi}` } : {}) };
}

type Completion = {
  model?: string;
  choices?: { message?: { content?: string | null; refusal?: string | null } }[];
};

/** OpenAI, Groq and anything that speaks the OpenAI Chat Completions API (Ollama, LM Studio, OpenRouter). */
async function viaOpenAI(p: Exclude<Provedor, "anthropic">, { system, user, schema }: Pedido): Promise<Gerado> {
  const modelo = modeloDe(p);
  const pedir = async (formato: object, sistema: string) => {
    try {
      return await fetch(`${baseDe(p)}/chat/completions`, {
        method: "POST",
        headers: cabecalhos(chave(CHAVE_DO_PROVEDOR[p])),
        body: JSON.stringify({
          model: modelo,
          messages: [
            { role: "system", content: sistema },
            { role: "user", content: user },
          ],
          response_format: formato,
          // Reasoning models spend part of the budget thinking; local servers only know the older name.
          ...(p === "compativel" ? { max_tokens: 4000 } : { max_completion_tokens: 8000 }),
        }),
        // Local models can be slow on modest hardware.
        signal: AbortSignal.timeout(p === "compativel" ? 120_000 : 60_000),
        cache: "no-store",
      });
    } catch {
      throw new ErroIA("outro", `Não deu para falar com a ${NOME_PROVEDOR[p]} agora.`);
    }
  };

  let r = await pedir({ type: "json_schema", json_schema: { name: "resumo", strict: true, schema } }, system);
  // Models without structured outputs reject json_schema; fall back to plain JSON mode with the schema in the prompt.
  if (r.status === 400) {
    r = await pedir(
      { type: "json_object" },
      `${system}\n\nResponda apenas com um objeto JSON que siga este JSON Schema:\n${JSON.stringify(schema)}`,
    );
  }
  if (r.status === 401 || r.status === 403) throw new ErroIA("chave", "Chave recusada.", r.status);
  if (r.status === 429) throw new ErroIA("limite", "Limite de uso atingido.", 429);
  if (!r.ok) throw new ErroIA("outro", `A ${NOME_PROVEDOR[p]} respondeu com erro ${r.status}.`, r.status);

  const j = (await r.json()) as Completion;
  const msg = j.choices?.[0]?.message;
  if (msg?.refusal) throw new ErroIA("outro", RECUSA);
  return { dados: lerJson(msg?.content), modelo: j.model || modelo };
}

export type Teste = "valida" | "recusada" | "indisponivel";

/** Checks credentials without spending tokens: lists models. */
export async function testarConexao(p: Provedor, cred: { chave?: string; url?: string }): Promise<Teste> {
  if (p === "anthropic") {
    try {
      await new Anthropic({ apiKey: cred.chave, maxRetries: 0, timeout: 15_000 }).models.list({ limit: 1 });
      return "valida";
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return "recusada";
      return "indisponivel";
    }
  }
  try {
    const r = await fetch(`${baseDe(p, cred.url)}/models`, {
      headers: cabecalhos(cred.chave),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (r.status === 401 || r.status === 403) return "recusada";
    return r.ok ? "valida" : "indisponivel";
  } catch {
    return "indisponivel";
  }
}
