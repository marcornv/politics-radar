import { ehMesmaOrigem } from "@/lib/acesso";
import { ErroIA, rankAgenda } from "@/lib/ia";
import { agendaItems, upcomingSessions } from "@/lib/pauta";
import { isCasa } from "@/lib/types";

const MAX_TEMA = 300;

export async function POST(req: Request, ctx: RouteContext<"/api/pauta/[casa]">) {
  // Ranking runs a model on this machine for every new item: only the Radar's own pages may ask for it.
  if (!ehMesmaOrigem(req)) return Response.json({ erro: "Origem não permitida." }, { status: 403 });
  const { casa } = await ctx.params;
  if (!isCasa(casa)) return Response.json({ erro: "Casa inválida." }, { status: 404 });
  // Optional free-text topic to rank by instead of "Sobre você".
  const corpo = await req.json().catch(() => ({}));
  const tema = typeof corpo?.tema === "string" ? corpo.tema.trim() : "";
  if (tema.length > MAX_TEMA) return Response.json({ erro: `Use até ${MAX_TEMA} caracteres no tema.` }, { status: 400 });

  const sessions = await upcomingSessions(casa).catch(() => null);
  if (!sessions) return Response.json({ erro: "Não foi possível carregar a pauta na fonte oficial." }, { status: 502 });
  const itens = agendaItems(casa, sessions);

  try {
    const ranking = await rankAgenda(
      itens.map((i) => ({ key: i.key, title: i.titulo, summary: i.ementa })),
      5,
      tema || undefined,
    );
    const porChave = new Map(itens.map((i) => [i.key, i]));
    return Response.json({
      modelo: ranking.model,
      itens: ranking.items.flatMap((r) => {
        const i = porChave.get(r.key);
        return i ? [i] : [];
      }),
    });
  } catch (e) {
    const erro = e instanceof ErroIA ? e.message : "Não foi possível ordenar a pauta agora.";
    return Response.json({ erro }, { status: 502 });
  }
}
