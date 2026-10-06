import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { MiniComposicao } from "@/components/MiniComposicao";
import { Escaneando, FonteIndisponivel, SectionTitle } from "@/components/ui";
import { PlacarMini, ResultadoChip } from "@/components/VoteBar";
import { addDays, formatDay, formatDayLong, formatTime, hasTime, today, weekStart } from "@/lib/dates";
import { agenda, emTramitacao, membros, votacoes } from "@/lib/legislativo";
import { type Casa, CASA_CURTA, type ProposicaoTramitando, type VotacaoResumo } from "@/lib/types";

async function Composicao({ casa }: { casa: Casa }) {
  const ms = await membros(casa).catch(() => null);
  if (!ms) return <FonteIndisponivel casa={CASA_CURTA[casa]} />;
  return <MiniComposicao casa={casa} membros={ms} />;
}

async function UltimasVotacoes() {
  const ate = today();
  const de = addDays(ate, -45);
  const [c, s] = await Promise.all([
    votacoes("camara", de, ate).catch(() => [] as VotacaoResumo[]),
    votacoes("senado", de, ate).catch(() => [] as VotacaoResumo[]),
  ]);
  const lista = [...c.filter((v) => v.nominal), ...s]
    .sort((a, b) => (a.data < b.data ? 1 : -1))
    .slice(0, 7);
  if (!lista.length) {
    return (
      <p className="panel p-6 text-[14px] text-ink-2">
        Nenhuma votação nominal nas últimas seis semanas. Veja as votações simbólicas em{" "}
        <Link href="/camara/votacoes" className="text-phosphor hover:underline">
          Votações
        </Link>
        .
      </p>
    );
  }
  return (
    <ul className="panel divide-y divide-line overflow-hidden">
      {lista.map((v) => (
        <li key={`${v.casa}-${v.id}`}>
          <Link
            href={`/${v.casa}/votacoes/${encodeURIComponent(v.id)}`}
            className="grid gap-x-4 gap-y-2 px-4 py-3 hover:bg-panel-2 sm:grid-cols-[1fr_170px]"
          >
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2 text-[12px] text-ink-2">
                <span>{CASA_CURTA[v.casa]}</span>
                <span className="tnum">{formatDay(v.data)}</span>
                <ResultadoChip aprovada={v.aprovada} />
              </span>
              <span className="mt-1 block font-display text-[15px] font-semibold text-ink">
                {v.proposicao?.sigla ?? v.descricao.slice(0, 60)}
              </span>
              {v.proposicao?.ementa && (
                <span className="mt-0.5 line-clamp-2 text-[13px] text-ink-2">{v.proposicao.ementa}</span>
              )}
            </span>
            <span className="self-center">{v.placar && <PlacarMini {...v.placar} />}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function EstaSemana() {
  const ini = weekStart(today());
  const fim = addDays(ini, 6);
  const [c, s] = await Promise.all([agenda("camara", ini, fim).catch(() => []), agenda("senado", ini, fim).catch(() => [])]);
  const todos = [...c, ...s].filter((e) => !/^cancelad/i.test(e.situacao));
  const agora = today();
  const proximos = todos
    .filter((e) => e.deliberativo && e.inicio.slice(0, 10) >= agora)
    .sort((a, b) => (a.inicio < b.inicio ? -1 : 1))
    .slice(0, 5);
  const itens = todos.reduce((a, e) => a + e.pauta.length, 0);

  return (
    <div className="panel p-4">
      <div className="tnum grid grid-cols-3 gap-3 border-b border-line pb-4">
        {[
          [todos.length, "eventos"],
          [todos.filter((e) => e.deliberativo).length, "com votação"],
          [itens, "itens em pauta"],
        ].map(([n, l]) => (
          <div key={l as string}>
            <div className="font-display text-[28px] font-semibold leading-none text-ink">{n}</div>
            <div className="mt-1 text-[12px] text-ink-2">{l}</div>
          </div>
        ))}
      </div>
      {proximos.length === 0 ? (
        <p className="pt-4 text-[13.5px] text-ink-2">
          Nenhuma sessão com votação marcada para o resto desta semana.{" "}
          <Link href="/agenda" className="text-phosphor hover:underline">
            Ver a agenda completa
          </Link>
        </p>
      ) : (
        <ul className="space-y-3 pt-4">
          {proximos.map((e) => (
            <li key={e.id} className="text-[13.5px]">
              <div className="flex items-baseline gap-2 text-[12px] text-ink-2">
                <span className="first-letter:uppercase">{formatDayLong(e.inicio).split(",")[0]}</span>
                {hasTime(e.inicio) && <span className="tnum">{formatTime(e.inicio)}</span>}
                <span>
                  {CASA_CURTA[e.casa]}, {e.orgao}
                </span>
              </div>
              <div className="line-clamp-2 text-ink">{e.titulo}</div>
              {e.pauta.length > 0 && <div className="text-[12px] text-muted">{e.pauta.length} {e.pauta.length === 1 ? "item" : "itens"} na pauta</div>}
            </li>
          ))}
        </ul>
      )}
      <Link href="/agenda" className="mt-4 inline-block text-[13px] text-phosphor hover:underline">
        Agenda da semana
      </Link>
    </div>
  );
}

async function NaFila() {
  const [c, s] = await Promise.all([
    emTramitacao("camara", 15).catch(() => [] as ProposicaoTramitando[]),
    emTramitacao("senado", 30).catch(() => [] as ProposicaoTramitando[]),
  ]);
  const prontas = [...c, ...s]
    .filter((p) => p.etapa === "em_pauta" || (p.etapa === "pronta_pauta" && p.fase === "plenario"))
    .filter((p) => ["PL", "PLP", "PEC", "MPV", "PDL", "PLS"].includes(p.tipo))
    .sort((a, b) => (a.dataSituacao < b.dataSituacao ? 1 : -1))
    .slice(0, 8);
  if (!prontas.length) {
    return (
      <p className="panel p-6 text-[14px] text-ink-2">
        Nada em pauta ou pronto para o plenário com movimento recente. Veja todas as etapas em{" "}
        <Link href="/camara/tramitacao" className="text-phosphor hover:underline">
          Tramitação
        </Link>
        .
      </p>
    );
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {prontas.map((p) => (
        <li key={`${p.casa}-${p.id}`}>
          <Link
            href={`/${p.casa}/proposicoes/${p.id}`}
            className="block h-full rounded-lg border border-line bg-panel px-3 py-2.5 hover:border-line-strong hover:bg-panel-2"
          >
            <span className="flex items-baseline gap-2 text-[12px] text-ink-2">
              <span className="font-display text-[14.5px] font-semibold text-ink">{p.sigla}</span>
              <span>{CASA_CURTA[p.casa]}</span>
              <span className="rounded border border-line px-1.5 text-ink">{p.orgao}</span>
              <span className={p.etapa === "em_pauta" ? "ml-auto text-phosphor" : "ml-auto"}>
                {p.etapa === "em_pauta" ? "em pauta" : "pronta"}
              </span>
            </span>
            <span className="mt-1 line-clamp-2 text-[13px] text-ink-2">{p.ementa}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function Painel() {
  await connection();
  const hoje = today();
  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 lg:mb-8">
        <div>
          <p className="text-[13px] text-ink-2 first-letter:uppercase">{formatDayLong(hoje)}</p>
          <h1 className="font-display text-[clamp(28px,3.6vw,42px)] font-semibold leading-[1.05]">
            Congresso Nacional agora
          </h1>
        </div>
        <p className="max-w-[46ch] text-[14px] text-ink-2">
          Quem ocupa as cadeiras, o que foi votado, o que está na fila e o que acontece nesta semana.
        </p>
      </header>

      <section className="panel radar-grid mb-8 grid gap-8 p-4 sm:p-6 lg:grid-cols-[1.55fr_1fr]">
        <Suspense fallback={<div className="aspect-[2/1]" />}>
          <Composicao casa="camara" />
        </Suspense>
        <Suspense fallback={<div className="aspect-[2/1]" />}>
          <Composicao casa="senado" />
        </Suspense>
      </section>

      <div className="grid gap-8 xl:grid-cols-[1.55fr_1fr]">
        <section className="min-w-0">
          <SectionTitle aside={<Link href="/camara/votacoes" className="text-[13px] text-phosphor hover:underline">Todas</Link>}>
            Últimas votações nominais
          </SectionTitle>
          <Suspense fallback={<Escaneando label="Buscando votações recentes" linhas={4} />}>
            <UltimasVotacoes />
          </Suspense>
        </section>
        <section className="min-w-0">
          <SectionTitle>Esta semana</SectionTitle>
          <Suspense fallback={<Escaneando label="Lendo as agendas" linhas={3} />}>
            <EstaSemana />
          </Suspense>
        </section>
      </div>

      <section className="mt-8">
        <SectionTitle
          aside={<Link href="/senado/tramitacao" className="text-[13px] text-phosphor hover:underline">Tramitação</Link>}
        >
          Na fila para votar
        </SectionTitle>
        <p className="-mt-2 mb-3 text-[13px] text-muted">
          Proposições em pauta em comissões ou plenário, ou prontas para o plenário, com movimento recente.
        </p>
        <Suspense fallback={<Escaneando label="Varrendo comissões e plenários. A primeira carga leva alguns segundos." linhas={2} />}>
          <NaFila />
        </Suspense>
      </section>
    </>
  );
}
