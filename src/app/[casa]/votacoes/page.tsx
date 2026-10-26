import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AgendaForYou } from "@/components/AgendaForYou";
import { PautaPrevista } from "@/components/PautaPrevista";
import { Escaneando, FonteIndisponivel, PageHeader, SegLinks } from "@/components/ui";
import { VotacoesLista } from "@/components/VotacoesLista";
import { addDays, today } from "@/lib/dates";
import { statusIA } from "@/lib/ia";
import { votacoes } from "@/lib/legislativo";
import { upcomingSessions } from "@/lib/pauta";
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
  const [futuras, ia] = await Promise.all([upcomingSessions(casa).catch(() => null), statusIA()]);
  if (!futuras) return <FonteIndisponivel casa={CASA_CURTA[casa]} />;
  return (
    <div className="space-y-6">
      {futuras.length > 0 && (
        <AgendaForYou casa={casa} hasProfile={!!ia?.leitor} model={ia ? ia.agenda : null} />
      )}
      <PautaPrevista casa={casa} eventos={futuras} />
    </div>
  );
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
