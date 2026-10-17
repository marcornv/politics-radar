import { ehMesmaOrigem } from "@/lib/acesso";
import { ErroIA, resumir } from "@/lib/ia";
import { proposicao } from "@/lib/legislativo";
import { resumoDisponivel } from "@/lib/resumo";
import { isCasa } from "@/lib/types";

export async function POST(req: Request, ctx: RouteContext<"/api/resumo/[casa]/[id]">) {
  // Each summary is billed to the user's AI account: only the Radar's own pages may ask for one.
  if (!ehMesmaOrigem(req)) return Response.json({ erro: "Origem não permitida." }, { status: 403 });
  const { casa, id } = await ctx.params;
  if (!isCasa(casa) || !/^m?\d+$/.test(id)) return Response.json({ erro: "Proposição inválida." }, { status: 404 });
  if (!(await resumoDisponivel())) {
    return Response.json({ erro: "Resumo por IA desativado: configure uma IA em Configurações." }, { status: 503 });
  }

  const p = await proposicao(casa, id).catch(() => null);
  if (!p) return Response.json({ erro: "Não foi possível carregar a proposição na fonte oficial." }, { status: 502 });

  try {
    return Response.json(await resumir(p));
  } catch (e) {
    const erro = e instanceof ErroIA ? e.message : "Não foi possível gerar o resumo agora.";
    return Response.json({ erro }, { status: 502 });
  }
}
