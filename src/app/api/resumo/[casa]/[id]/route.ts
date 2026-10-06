import Anthropic from "@anthropic-ai/sdk";
import { ehMesmaOrigem } from "@/lib/acesso";
import { proposicao } from "@/lib/legislativo";
import { resumir, resumoDisponivel } from "@/lib/resumo";
import { isCasa } from "@/lib/types";

export async function POST(req: Request, ctx: RouteContext<"/api/resumo/[casa]/[id]">) {
  // Each summary is billed to the user's Anthropic account: only the Radar's own pages may ask for one.
  if (!ehMesmaOrigem(req)) return Response.json({ erro: "Origem não permitida." }, { status: 403 });
  const { casa, id } = await ctx.params;
  if (!isCasa(casa) || !/^m?\d+$/.test(id)) return Response.json({ erro: "Proposição inválida." }, { status: 404 });
  if (!resumoDisponivel()) {
    return Response.json({ erro: "Resumo por IA desativado: adicione a chave da Anthropic em Configurações." }, { status: 503 });
  }

  const p = await proposicao(casa, id).catch(() => null);
  if (!p) return Response.json({ erro: "Não foi possível carregar a proposição na fonte oficial." }, { status: 502 });

  try {
    return Response.json(await resumir(p));
  } catch (e) {
    let erro = "Não foi possível gerar o resumo agora.";
    if (e instanceof Anthropic.AuthenticationError) erro = "A chave da Anthropic foi recusada. Troque-a em Configurações.";
    else if (e instanceof Anthropic.RateLimitError) erro = "Limite de uso da API atingido. Tente em alguns minutos.";
    else if (e instanceof Anthropic.APIError) erro = `A API do Claude respondeu ${e.status}.`;
    else if (e instanceof Error) erro = e.message;
    return Response.json({ erro }, { status: 502 });
  }
}
