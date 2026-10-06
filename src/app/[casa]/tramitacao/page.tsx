import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { TramitacaoBoard } from "@/components/TramitacaoBoard";
import { Escaneando, FonteIndisponivel, PageHeader, SegLinks } from "@/components/ui";
import { comissoes, emTramitacao } from "@/lib/legislativo";
import { type Casa, CASA_CURTA, isCasa } from "@/lib/types";

const PERIODOS = [7, 15, 30] as const;

export async function generateMetadata({ params }: PageProps<"/[casa]/tramitacao">) {
  const { casa } = await params;
  return { title: isCasa(casa) ? `Tramitação, ${CASA_CURTA[casa]} | Radar Legislativo` : "Radar Legislativo" };
}

async function Board({ casa, dias }: { casa: Casa; dias: number }) {
  const [itens, coms] = await Promise.all([
    emTramitacao(casa, dias).catch(() => null),
    comissoes(casa).catch(() => []),
  ]);
  if (!itens) return <FonteIndisponivel casa={CASA_CURTA[casa]} />;
  const extras = casa === "camara" ? [{ id: "180", sigla: "PLEN", nome: "Plenário" }, { id: "4", sigla: "MESA", nome: "Mesa Diretora" }] : [];
  return <TramitacaoBoard casa={casa} itens={itens} comissoes={[...coms, ...extras]} />;
}

export default async function TramitacaoPage({ params, searchParams }: PageProps<"/[casa]/tramitacao">) {
  const { casa } = await params;
  if (!isCasa(casa)) notFound();
  await connection();
  const sp = await searchParams;
  const dias = PERIODOS.find((p) => String(p) === sp.periodo) ?? 15;

  return (
    <>
      <PageHeader
        title="O que está andando"
        lead={
          casa === "camara"
            ? "Projetos de lei, PECs, medidas provisórias e decretos legislativos com movimentação recente na Câmara, agrupados pela etapa em que estão agora."
            : "Matérias com movimentação recente nas comissões permanentes e no plenário do Senado, mais tudo que já está em pauta, agrupadas pela etapa atual."
        }
      >
        <SegLinks
          label="Movimentação recente"
          items={PERIODOS.map((p) => ({
            href: `/${casa}/tramitacao?periodo=${p}`,
            label: `${p} dias`,
            active: p === dias,
          }))}
        />
      </PageHeader>
      <Suspense
        key={dias}
        fallback={
          <Escaneando
            label={
              casa === "camara"
                ? "Consultando a situação de cada proposição na Câmara. A primeira carga leva alguns segundos."
                : "Lendo as matérias de cada comissão do Senado"
            }
            linhas={4}
          />
        }
      >
        <Board casa={casa} dias={dias} />
      </Suspense>
    </>
  );
}
