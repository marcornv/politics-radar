import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ComposicaoExplorer } from "@/components/ComposicaoExplorer";
import { FonteIndisponivel, PageHeader } from "@/components/ui";
import { membros } from "@/lib/legislativo";
import { CASA_CURTA, CASA_LABEL, isCasa } from "@/lib/types";

export async function generateMetadata({ params }: PageProps<"/[casa]">) {
  const { casa } = await params;
  return { title: isCasa(casa) ? `Composição, ${CASA_CURTA[casa]} | Radar Legislativo` : "Radar Legislativo" };
}

export default async function ComposicaoPage({ params }: PageProps<"/[casa]">) {
  const { casa } = await params;
  if (!isCasa(casa)) notFound();
  await connection();

  const lista = await membros(casa).catch(() => null);
  const nPartidos = lista ? new Set(lista.map((m) => m.partido)).size : 0;

  return (
    <>
      <PageHeader
        title={CASA_LABEL[casa]}
        lead={
          lista
            ? `${lista.length} ${casa === "camara" ? "deputados em exercício" : "senadores em exercício"}, de ${nPartidos} partidos. Filtre por partido, estado ou nome.`
            : undefined
        }
      />
      {lista ? <ComposicaoExplorer casa={casa} membros={lista} /> : <FonteIndisponivel casa={CASA_CURTA[casa]} />}
    </>
  );
}
