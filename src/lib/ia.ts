import "server-only";
import type { NomeChave } from "./config";
import type { Resumo } from "./resumo";
import type { ProposicaoDetalhe } from "./types";

/**
 * Client for the AI service in `ia/` (Python). Provider choice, prompts, provider calls and the
 * summary cache all live there; this file only talks to it over HTTP on this machine.
 */
const IA_URL = (process.env.IA_URL || "http://127.0.0.1:8787").replace(/\/+$/, "");

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

/** Failure the API route can show as is: the service already wrote the message in Portuguese. */
export class ErroIA extends Error {}

export interface StatusIA {
  /** The provider chosen in Configurações, or the first configured one if that choice is gone. */
  ativo: Provedor | null;
  configurados: { id: Provedor; nome: string; modelo: string }[];
  compativel: boolean;
  /** Claude Code / `ant` login on this machine, used when no Anthropic key is set. */
  loginClaude: boolean;
}

/** What the AI service sees right now, or null when it isn't running. */
export async function statusIA(): Promise<StatusIA | null> {
  try {
    const r = await fetch(`${IA_URL}/status`, { signal: AbortSignal.timeout(2_000), cache: "no-store" });
    return r.ok ? ((await r.json()) as StatusIA) : null;
  } catch {
    return null;
  }
}

export async function resumir(p: ProposicaoDetalhe): Promise<Resumo> {
  let r: Response;
  try {
    r = await fetch(`${IA_URL}/resumo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
      // Local models can take up to two minutes, plus a retry without structured outputs.
      signal: AbortSignal.timeout(300_000),
      cache: "no-store",
    });
  } catch {
    throw new ErroIA("O serviço de IA não está rodando. Inicie o Radar com npm run dev.");
  }
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new ErroIA(j?.erro ?? "Não foi possível gerar o resumo agora.");
  return j as Resumo;
}

export type Teste = "valida" | "recusada" | "indisponivel";

/** Checks credentials without spending tokens. Reports "indisponivel" when the AI service itself is down. */
export async function testarConexao(p: Provedor, cred: { chave?: string; url?: string }): Promise<Teste> {
  try {
    const r = await fetch(`${IA_URL}/testar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provedor: p, ...cred }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    return r.ok ? ((await r.json()) as { resultado: Teste }).resultado : "indisponivel";
  } catch {
    return "indisponivel";
  }
}
