"use server";

import { refresh } from "next/cache";
import { ehAcessoLocal } from "@/lib/acesso";
import { CHAVES, chave, type NomeChave, salvar } from "@/lib/config";
import { ehProvedor, NOME_PROVEDOR, type Provedor, statusIA, type Teste, testarConexao } from "@/lib/ia";

export type EstadoChave = { tipo: "ok" | "erro" | "aviso"; msg: string } | null;

const BLOQUEADO: EstadoChave = {
  tipo: "erro",
  msg: "As configurações só podem ser alteradas no computador onde o Radar está rodando.",
};

const PROVEDOR_DA_CHAVE: Partial<Record<NomeChave, Provedor>> = {
  ANTHROPIC_API_KEY: "anthropic",
  OPENAI_API_KEY: "openai",
  GROQ_API_KEY: "groq",
};

async function testar(nome: NomeChave, valor: string): Promise<Teste> {
  const provedor = PROVEDOR_DA_CHAVE[nome];
  if (provedor) return testarConexao(provedor, { chave: valor });
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
  OPENAI_API_KEY: { o: "a OpenAI", por: "pela OpenAI", com: "com a OpenAI" },
  GROQ_API_KEY: { o: "a Groq", por: "pela Groq", com: "com a Groq" },
  COMPATIVEL_API_KEY: { o: "o servidor", por: "pelo servidor", com: "com o servidor" },
  TRANSPARENCIA_API_KEY: { o: "o Portal da Transparência", por: "pelo Portal da Transparência", com: "com o Portal da Transparência" },
};

export async function acaoChave(_prev: EstadoChave, form: FormData): Promise<EstadoChave> {
  if (!(await ehAcessoLocal())) return BLOQUEADO;
  const nome = form.get("nome") as NomeChave;
  // The compatible endpoint has its own form, since it also needs a URL and a model.
  if (!CHAVES.includes(nome) || nome === "COMPATIVEL_API_KEY") return { tipo: "erro", msg: "Chave desconhecida." };
  const intent = form.get("intent");

  if (intent === "remover") {
    await salvar({ [nome]: null });
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
  await salvar({ [nome]: valor });
  refresh();
  return t === "valida"
    ? { tipo: "ok", msg: "Chave salva e funcionando." }
    : { tipo: "aviso", msg: `Chave salva, mas não deu para testar agora porque ${SERVICO[nome].o} não respondeu.` };
}

export async function acaoProvedor(_prev: EstadoChave, form: FormData): Promise<EstadoChave> {
  if (!(await ehAcessoLocal())) return BLOQUEADO;
  const provedor = form.get("provedor");
  const configurados = (await statusIA())?.configurados ?? [];
  if (!ehProvedor(provedor) || !configurados.some((c) => c.id === provedor)) {
    return { tipo: "erro", msg: "Escolha uma IA já configurada." };
  }
  await salvar({ IA_PROVEDOR: provedor });
  refresh();
  return { tipo: "ok", msg: `Os resumos agora usam a ${NOME_PROVEDOR[provedor]}.` };
}

const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/;

export async function acaoCompativel(_prev: EstadoChave, form: FormData): Promise<EstadoChave> {
  if (!(await ehAcessoLocal())) return BLOQUEADO;

  if (form.get("intent") === "remover") {
    await salvar({ COMPATIVEL_URL: null, COMPATIVEL_MODELO: null, COMPATIVEL_API_KEY: null });
    refresh();
    return { tipo: "ok", msg: "Configuração removida." };
  }

  const bruta = String(form.get("url") ?? "").trim();
  const modelo = String(form.get("modelo") ?? "").trim();
  // An empty key field on an existing setup keeps the saved key.
  const chaveApi = String(form.get("valor") ?? "").trim() || chave("COMPATIVEL_API_KEY");

  let url: URL;
  try {
    url = new URL(bruta);
  } catch {
    return { tipo: "erro", msg: "Informe a URL base completa, por exemplo http://localhost:11434/v1." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { tipo: "erro", msg: "A URL precisa começar com http:// ou https://." };
  if (url.username || url.password) return { tipo: "erro", msg: "Não coloque usuário e senha na URL; use o campo de chave." };
  if (!modelo) return { tipo: "erro", msg: "Informe o nome do modelo." };
  if (chaveApi && /\s/.test(chaveApi)) return { tipo: "erro", msg: "A chave não pode ter espaços." };

  const base = url.href.replace(/\/+$/, "");
  const t = await testarConexao("compativel", { chave: chaveApi, url: base });
  if (t === "recusada") return { tipo: "erro", msg: "O servidor recusou a chave e nada foi salvo." };

  await salvar({ COMPATIVEL_URL: base, COMPATIVEL_MODELO: modelo, COMPATIVEL_API_KEY: chaveApi ?? null });
  refresh();
  if (url.protocol === "http:" && chaveApi && !LOCAL.test(url.hostname)) {
    return { tipo: "aviso", msg: "Salvo, mas a URL usa http:// fora deste computador: a chave vai trafegar sem criptografia." };
  }
  return t === "valida"
    ? { tipo: "ok", msg: "Salvo e funcionando." }
    : { tipo: "aviso", msg: "Salvo, mas o servidor não respondeu à listagem de modelos. Confira a URL se o resumo falhar." };
}
