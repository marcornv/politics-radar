import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AgendaSemana } from "@/components/AgendaSemana";
import { Escaneando, PageHeader } from "@/components/ui";
import { addDays, formatDay, parseDay, today, weekStart } from "@/lib/dates";
import { agenda } from "@/lib/legislativo";

export const metadata = { title: "Agenda da semana | Radar Legislativo" };

async function Semana({ inicio }: { inicio: string }) {
  const fim = addDays(inicio, 6);
  const [c, s] = await Promise.all([agenda("camara", inicio, fim).catch(() => []), agenda("senado", inicio, fim).catch(() => [])]);
  const eventos = [...c, ...s].sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
  return <AgendaSemana inicio={inicio} eventos={eventos} hoje={today()} />;
}

export default async function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  await connection();
  const sp = await searchParams;
  const atual = weekStart(today());
  const inicio = weekStart(parseDay(sp.semana) ?? atual);
  const fim = addDays(inicio, 4);
  const ehAtual = inicio === atual;

  const nav = (d: string, label: string, rel: string) => (
    <Link
      href={d === atual ? "/agenda" : `/agenda?semana=${d}`}
      scroll={false}
      aria-label={rel}
      className="rounded-md border border-line px-2.5 py-1 text-[13px] text-ink-2 hover:border-line-strong hover:text-ink"
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={ehAtual ? "Agenda desta semana" : `Semana de ${formatDay(inicio)} a ${formatDay(fim)}`}
        lead="Sessões do plenário e reuniões de comissões da Câmara e do Senado. Abra uma pauta para ver o que pode ser votado."
      >
        <div className="flex items-center gap-1.5">
          {nav(addDays(inicio, -7), "← Anterior", "Semana anterior")}
          {!ehAtual && nav(atual, "Esta semana", "Voltar para esta semana")}
          {nav(addDays(inicio, 7), "Próxima →", "Próxima semana")}
        </div>
      </PageHeader>
      <Suspense key={inicio} fallback={<Escaneando label="Lendo as agendas da Câmara e do Senado" linhas={4} />}>
        <Semana inicio={inicio} />
      </Suspense>
    </>
  );
}
