"use server";

import Anthropic from "@anthropic-ai/sdk";
import { refresh } from "next/cache";
import { ehAcessoLocal } from "@/lib/acesso";
import { CHAVES, chave, type NomeChave, removerChave, salvarChave } from "@/lib/config";

export type EstadoChave = { tipo: "ok" | "erro" | "aviso"; msg: string } | null;

type Teste = "valida" | "recusada" | "indisponivel";

async function testar(nome: NomeChave, valor: string): Promise<Teste> {
  if (nome === "ANTHROPIC_API_KEY") {
    try {
      await new Anthropic({ apiKey: valor, maxRetries: 0, timeout: 15_000 }).models.list({ limit: 1 });
      return "valida";
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return "recusada";
      return "indisponivel";
    }
  }
  try {
    const ano = new Date().getFullYear();
    const r = await fetch(`https://api.portaldatransparencia.gov.br/api-de-dados/emendas?ano=${ano}&pagina=1`, {
      headers: { Accept: "application/json", "chave-api-dados": valor },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (r.status === 401 || r.status === 403) return "recusada";
    return r.ok ? "valida" : "indisponivel";
  } catch {
    return "indisponivel";
  }
}

// Portuguese contractions differ by gender: "pela Anthropic", "pelo Portal".
const SERVICO: Record<NomeChave, { o: string; por: string; com: string }> = {
  ANTHROPIC_API_KEY: { o: "a Anthropic", por: "pela Anthropic", com: "com a Anthropic" },
  TRANSPARENCIA_API_KEY: { o: "o Portal da Transparência", por: "pelo Portal da Transparência", com: "com o Portal da Transparência" },
};

export async function acaoChave(_prev: EstadoChave, form: FormData): Promise<EstadoChave> {
  if (!(await ehAcessoLocal())) {
    return { tipo: "erro", msg: "As chaves só podem ser alteradas no computador onde o Radar está rodando." };
  }
  const nome = form.get("nome") as NomeChave;
  if (!CHAVES.includes(nome)) return { tipo: "erro", msg: "Chave desconhecida." };
  const intent = form.get("intent");

  if (intent === "remover") {
    await removerChave(nome);
    refresh();
    return { tipo: "ok", msg: "Chave removida." };
  }

  if (intent === "testar") {
    const atual = chave(nome);
    if (!atual) return { tipo: "erro", msg: "Nenhuma chave configurada para testar." };
    const t = await testar(nome, atual);
    if (t === "valida") return { tipo: "ok", msg: "Funcionando." };
    if (t === "recusada") return { tipo: "erro", msg: `A chave foi recusada ${SERVICO[nome].por}. Cole uma chave nova.` };
    return { tipo: "aviso", msg: `Não deu para falar ${SERVICO[nome].com} agora. Tente de novo em instantes.` };
  }

  const valor = String(form.get("valor") ?? "").trim();
  if (!valor) return { tipo: "erro", msg: "Cole a chave no campo antes de salvar." };
  if (/\s/.test(valor)) return { tipo: "erro", msg: "A chave não pode ter espaços. Confira se copiou só a chave." };

  const t = await testar(nome, valor);
  if (t === "recusada") {
    return { tipo: "erro", msg: `A chave foi recusada ${SERVICO[nome].por} e não foi salva. Confira se copiou a chave inteira.` };
  }
  await salvarChave(nome, valor);
  refresh();
  return t === "valida"
    ? { tipo: "ok", msg: "Chave salva e funcionando." }
    : { tipo: "aviso", msg: `Chave salva, mas não deu para testar agora porque ${SERVICO[nome].o} não respondeu.` };
}
