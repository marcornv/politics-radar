import "server-only";
import { readFileSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * API keys typed in the Configurações screen. Stored in plain text in
 * `.config/chaves.json` next to the project (gitignored, mode 600), never
 * sent back to the browser in full. A key saved here wins over the same
 * variable in `.env.local`.
 */
export const CHAVES = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GROQ_API_KEY",
  "COMPATIVEL_API_KEY",
  "TRANSPARENCIA_API_KEY",
] as const;
export type NomeChave = (typeof CHAVES)[number];

/** Non-secret settings kept in the same file, with the same precedence over `.env.local`. */
export const AJUSTES = ["IA_PROVEDOR", "COMPATIVEL_URL", "COMPATIVEL_MODELO"] as const;
export type NomeAjuste = (typeof AJUSTES)[number];

type Nome = NomeChave | NomeAjuste;

const DIR = path.join(process.cwd(), ".config");
const ARQUIVO = path.join(DIR, "chaves.json");

type Arquivo = Partial<Record<Nome, string>>;

function ler(): Arquivo {
  try {
    return JSON.parse(readFileSync(ARQUIVO, "utf8")) as Arquivo;
  } catch {
    return {};
  }
}

async function gravar(dados: Arquivo) {
  await mkdir(DIR, { recursive: true });
  await writeFile(ARQUIVO, JSON.stringify(dados, null, 2), { mode: 0o600 });
  await chmod(ARQUIVO, 0o600).catch(() => {});
}

export function chave(nome: Nome): string | undefined {
  return ler()[nome]?.trim() || process.env[nome]?.trim() || undefined;
}

export type Origem = "app" | "env" | null;

export function origem(nome: Nome): Origem {
  if (ler()[nome]?.trim()) return "app";
  if (process.env[nome]?.trim()) return "env";
  return null;
}

/** "sk-ant-…a1B2": enough to recognise a key without revealing it. */
export function mascarar(v: string): string {
  if (v.length <= 10) return "••••";
  const prefixo = v.match(/^[a-z]+-[a-z]+-/i)?.[0] ?? v.slice(0, 4);
  return `${prefixo}…${v.slice(-4)}`;
}

/** Writes several values at once; an empty value removes the entry. */
export async function salvar(valores: Partial<Record<Nome, string | null>>) {
  const dados = ler();
  for (const [nome, valor] of Object.entries(valores) as [Nome, string | null][]) {
    if (valor?.trim()) dados[nome] = valor.trim();
    else delete dados[nome];
  }
  await gravar(dados);
}
