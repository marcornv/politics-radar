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
export const CHAVES = ["ANTHROPIC_API_KEY", "TRANSPARENCIA_API_KEY"] as const;
export type NomeChave = (typeof CHAVES)[number];

const DIR = path.join(process.cwd(), ".config");
const ARQUIVO = path.join(DIR, "chaves.json");

type Arquivo = Partial<Record<NomeChave, string>>;

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

export function chave(nome: NomeChave): string | undefined {
  return ler()[nome]?.trim() || process.env[nome]?.trim() || undefined;
}

export type Origem = "app" | "env" | null;

export function origem(nome: NomeChave): Origem {
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

export async function salvarChave(nome: NomeChave, valor: string) {
  const dados = ler();
  dados[nome] = valor.trim();
  await gravar(dados);
}

export async function removerChave(nome: NomeChave) {
  const dados = ler();
  delete dados[nome];
  await gravar(dados);
}
