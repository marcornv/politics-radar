import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PautaPrevista } from "@/components/PautaPrevista";
import { Escaneando, FonteIndisponivel, PageHeader, SegLinks } from "@/components/ui";
import { VotacoesLista } from "@/components/VotacoesLista";
import { addDays, today } from "@/lib/dates";
import { agenda, votacoes } from "@/lib/legislativo";
import { type Casa, CASA_CURTA, isCasa } from "@/lib/types";

const PERIODOS = [7, 30, 90] as const;

export async function generateMetadata({ params }: PageProps<"/[casa]/votacoes">) {
  const { casa } = await params;
  return { title: isCasa(casa) ? `Votações, ${CASA_CURTA[casa]} | Radar Legislativo` : "Radar Legislativo" };
}

async function Realizadas({ casa, dias }: { casa: Casa; dias: number }) {
  const ate = today();
  const lista = await votacoes(casa, addDays(ate, -dias), ate).catch(() => null);
  if (!lista) return <FonteIndisponivel casa={CASA_CURTA[casa]} />;
  return <VotacoesLista casa={casa} votacoes={lista} />;
}

async function Previstas({ casa }: { casa: Casa }) {
  const de = today();
  const evs = await agenda(casa, de, addDays(de, 14)).catch(() => null);
  if (!evs) return <FonteIndisponivel casa={CASA_CURTA[casa]} />;
  const futuras = evs.filter(
    (e) => e.deliberativo && e.pauta.length > 0 && !/encerrad|cancelad|realizada|n[ãa]o realizada/i.test(e.situacao),
  );
  return <PautaPrevista casa={casa} eventos={futuras} />;
}

export default async function VotacoesPage({ params, searchParams }: PageProps<"/[casa]/votacoes">) {
  const { casa } = await params;
  if (!isCasa(casa)) notFound();
  await connection();
  const sp = await searchParams;
  const aba = sp.aba === "previstas" ? "previstas" : "realizadas";
  const dias = PERIODOS.find((p) => String(p) === sp.periodo) ?? 30;

  return (
    <>
      <PageHeader
        title={casa === "camara" ? "Votações na Câmara" : "Votações no Senado"}
        lead={
          aba === "realizadas"
            ? "Abra uma votação para ver o placar, a orientação de cada bancada e como votou cada parlamentar."
            : "Itens na pauta das próximas sessões deliberativas. O que está aqui pode ser votado nos próximos dias."
        }
      >
        <div className="flex flex-wrap gap-2">
          <SegLinks
            label="Realizadas ou previstas"
            items={[
              { href: `/${casa}/votacoes?periodo=${dias}`, label: "Realizadas", active: aba === "realizadas" },
              { href: `/${casa}/votacoes?aba=previstas`, label: "Previstas", active: aba === "previstas" },
            ]}
          />
          {aba === "realizadas" && (
            <SegLinks
              label="Período"
              items={PERIODOS.map((p) => ({
                href: `/${casa}/votacoes?periodo=${p}`,
                label: `${p} dias`,
                active: p === dias,
              }))}
            />
          )}
        </div>
      </PageHeader>

      <Suspense
        key={`${aba}-${dias}`}
        fallback={<Escaneando label={aba === "realizadas" ? "Buscando votações nas fontes oficiais" : "Lendo as pautas publicadas"} linhas={5} />}
      >
        {aba === "realizadas" ? <Realizadas casa={casa} dias={dias} /> : <Previstas casa={casa} />}
      </Suspense>
    </>
  );
}
