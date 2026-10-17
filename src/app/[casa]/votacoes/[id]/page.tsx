import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ResumoCard } from "@/components/ResumoCard";
import { FonteIndisponivel } from "@/components/ui";
import { VotacaoExplorer } from "@/components/VotacaoExplorer";
import { PlacarMini, ResultadoChip } from "@/components/VoteBar";
import { formatDayLong, formatTime, hasTime } from "@/lib/dates";
import { votacao } from "@/lib/legislativo";
import { resumoDisponivel } from "@/lib/resumo";
import { CASA_CURTA, isCasa } from "@/lib/types";

export async function generateMetadata({ params }: PageProps<"/[casa]/votacoes/[id]">) {
  const { casa } = await params;
  return { title: isCasa(casa) ? `Votação, ${CASA_CURTA[casa]} | Radar Legislativo` : "Radar Legislativo" };
}

export default async function VotacaoPage({ params }: PageProps<"/[casa]/votacoes/[id]">) {
  const { casa, id: raw } = await params;
  if (!isCasa(casa)) notFound();
  await connection();
  const id = decodeURIComponent(raw);

  let v;
  try {
    v = await votacao(casa, id);
  } catch {
    return <FonteIndisponivel casa={CASA_CURTA[casa]} />;
  }
  if (!v) notFound();

  const prop = v.proposicao;

  return (
    <>
      <nav className="mb-4 text-[13px]">
        <Link href={`/${casa}/votacoes`} className="text-ink-2 hover:text-ink">
          ← Votações {casa === "camara" ? "da Câmara" : "do Senado"}
        </Link>
      </nav>

      <header className="mb-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <p className="text-[13px] first-letter:uppercase text-ink-2">
            {formatDayLong(v.data)}
            {hasTime(v.data) && `, ${formatTime(v.data)}`} <span className="normal-case text-muted">no {v.orgao}</span>
          </p>
          <h1 className="mt-1 font-display text-[clamp(26px,3.4vw,38px)] font-semibold leading-[1.1]">
            {prop ? prop.sigla : "Votação"}
          </h1>
          {prop?.ementa && <p className="mt-2 max-w-[70ch] text-[15.5px] text-ink">{prop.ementa}</p>}
          <p className="mt-3 max-w-[75ch] text-[13.5px] text-ink-2">{v.descricao}</p>
          {prop && (
            <Link
              href={`/${casa}/proposicoes/${prop.id}`}
              className="mt-3 inline-block text-[13px] text-phosphor hover:underline"
            >
              Ver tramitação completa de {prop.sigla}
            </Link>
          )}
        </div>
        <div className="panel self-start p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-display text-[14px] font-semibold">Resultado</span>
            <ResultadoChip aprovada={v.aprovada} />
          </div>
          {v.placar && v.nominal ? (
            <PlacarMini {...v.placar} />
          ) : (
            <p className="text-[13px] text-ink-2">Votação simbólica: não há registro do voto de cada parlamentar.</p>
          )}
        </div>
      </header>

      {prop && (
        <div className="mb-6">
          <ResumoCard key={prop.id} casa={casa} id={prop.id} disponivel={await resumoDisponivel()} />
        </div>
      )}

      {v.votos.length > 0 ? (
        <VotacaoExplorer v={v} />
      ) : (
        <div className="panel p-8 text-center text-[14px] text-ink-2">
          Esta foi uma votação simbólica ou de procedimento. Os parlamentares não registraram voto individual no painel.
        </div>
      )}

      {v.relato && (
        <details className="panel mt-6 p-4 text-[13.5px] text-ink-2">
          <summary className="cursor-pointer font-display text-[14px] font-semibold text-ink">
            Registro oficial da sessão
          </summary>
          <p className="mt-2 whitespace-pre-line">{v.relato}</p>
        </details>
      )}
    </>
  );
}
