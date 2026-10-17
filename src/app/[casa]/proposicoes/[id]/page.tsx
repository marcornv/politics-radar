import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FaseTrack } from "@/components/FaseTrack";
import { ResumoCard } from "@/components/ResumoCard";
import { FonteIndisponivel } from "@/components/ui";
import { PlacarMini, ResultadoChip } from "@/components/VoteBar";
import { EmendasProjetoLista } from "@/components/EmendasProjetoLista";
import { autores } from "@/lib/camara";
import { emendasDoProcesso } from "@/lib/perfil-senado";
import { formatDate } from "@/lib/dates";
import { ETAPA_LABEL } from "@/lib/fase";
import { proposicao } from "@/lib/legislativo";
import { resumoDisponivel } from "@/lib/resumo";
import { CASA_CURTA, isCasa, type ProposicaoDetalhe } from "@/lib/types";

export async function generateMetadata({ params }: PageProps<"/[casa]/proposicoes/[id]">) {
  const { casa } = await params;
  return { title: isCasa(casa) ? `Proposição, ${CASA_CURTA[casa]} | Radar Legislativo` : "Radar Legislativo" };
}

export default async function ProposicaoPage({ params }: PageProps<"/[casa]/proposicoes/[id]">) {
  const { casa, id } = await params;
  if (!isCasa(casa) || !/^m?\d+$/.test(id)) notFound();
  await connection();

  let p: ProposicaoDetalhe | null;
  try {
    p = await proposicao(casa, id);
  } catch {
    return <FonteIndisponivel casa={CASA_CURTA[casa]} />;
  }
  if (!p) notFound();
  if (casa === "camara" && !p.autoria) p.autoria = await autores(p.id);
  const emendas = casa === "senado" ? await emendasDoProcesso(p.id).catch(() => []) : [];

  const fatos: [string, React.ReactNode][] = [
    ["Situação", p.situacao || "Sem registro"],
    ["Onde está", p.orgao || "Sem registro"],
    ["Etapa", ETAPA_LABEL[p.etapa]],
    ...(p.relator ? ([["Relator", p.relator]] as [string, string][]) : []),
    ...(p.regime ? ([["Regime", p.regime]] as [string, string][]) : []),
    ...(p.autoria ? ([["Autoria", p.autoria]] as [string, string][]) : []),
    ...(p.apresentacao ? ([["Apresentada em", formatDate(p.apresentacao)]] as [string, string][]) : []),
  ];

  return (
    <>
      <nav className="mb-4 text-[13px]">
        <Link href={`/${casa}/tramitacao`} className="text-ink-2 hover:text-ink">
          ← Tramitação {casa === "camara" ? "na Câmara" : "no Senado"}
        </Link>
      </nav>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <header>
            <p className="text-[13px] text-ink-2">{p.tipo}</p>
            <h1 className="mt-1 font-display text-[clamp(28px,3.6vw,42px)] font-semibold leading-[1.05]">{p.sigla}</h1>
            <p className="mt-3 max-w-[70ch] text-[16px] leading-relaxed text-ink">{p.ementa}</p>
            {p.ementaDetalhada && <p className="mt-2 max-w-[70ch] text-[14px] text-ink-2">{p.ementaDetalhada}</p>}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
              <a href={p.urlOficial} target="_blank" rel="noreferrer" className="text-phosphor hover:underline">
                Página oficial
              </a>
              {p.urlTexto && (
                <a href={p.urlTexto} target="_blank" rel="noreferrer" className="text-phosphor hover:underline">
                  Texto integral
                </a>
              )}
            </div>
          </header>

          <section className="panel p-4 sm:p-5">
            <FaseTrack fase={p.fase} situacao={p.situacao} />
          </section>

          <ResumoCard key={p.id} casa={casa} id={p.id} disponivel={await resumoDisponivel()} />

          {emendas.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-[17px] font-semibold">
                Emendas <span className="tnum text-[14px] font-normal text-muted">{emendas.length}</span>
              </h2>
              <EmendasProjetoLista itens={emendas} mostrarAutor />
            </section>
          )}

          <section>
            <h2 className="mb-3 font-display text-[17px] font-semibold">Linha do tempo</h2>
            {p.tramitacoes.length === 0 ? (
              <p className="text-[14px] text-ink-2">A fonte oficial não publicou movimentações para esta matéria.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-line pl-5">
                {p.tramitacoes.slice(0, 25).map((t, i) => (
                  <li key={i} className="relative">
                    <span
                      className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-bg ${
                        i === 0 ? "bg-phosphor" : "bg-line-strong"
                      }`}
                      aria-hidden
                    />
                    <div className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                      <span className="tnum text-ink-2">{formatDate(t.data)}</span>
                      {t.orgao && <span className="rounded border border-line px-1.5 text-[11.5px] text-ink">{t.orgao}</span>}
                    </div>
                    <p className="mt-0.5 text-[14px] text-ink">{t.descricao}</p>
                    {t.despacho && t.despacho !== t.descricao && (
                      <p className="mt-0.5 max-w-[80ch] text-[13px] text-ink-2">{t.despacho}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {p.tramitacoes.length > 25 && (
              <p className="mt-3 text-[12.5px] text-muted">
                Mostrando as 25 movimentações mais recentes de {p.tramitacoes.length}.{" "}
                <a href={p.urlOficial} target="_blank" rel="noreferrer" className="text-phosphor hover:underline">
                  Histórico completo na página oficial
                </a>
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <dl className="panel grid grid-cols-[110px_1fr] gap-x-3 gap-y-2.5 p-4 text-[13.5px]">
            {fatos.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="text-ink">{v}</dd>
              </div>
            ))}
          </dl>

          {p.keywords && (
            <div>
              <h2 className="mb-2 font-display text-[14px] font-semibold">Temas</h2>
              <ul className="flex flex-wrap gap-1.5">
                {p.keywords
                  .split(/,\s*/)
                  .map((k) => k.trim().replace(/\.$/, ""))
                  .filter(Boolean)
                  .slice(0, 14)
                  .map((k) => (
                    <li key={k} className="rounded-full border border-line px-2 py-0.5 text-[12px] text-ink-2">
                      {k.charAt(0).toUpperCase() + k.slice(1).toLowerCase()}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <div>
            <h2 className="mb-2 font-display text-[14px] font-semibold">Votações</h2>
            {p.votacoes.length === 0 ? (
              <p className="text-[13px] text-ink-2">Ainda não houve votação registrada desta matéria nesta Casa.</p>
            ) : (
              <ul className="panel divide-y divide-line overflow-hidden">
                {p.votacoes.slice(0, 12).map((v) => (
                  <li key={v.id}>
                    <Link href={`/${casa}/votacoes/${encodeURIComponent(v.id)}`} className="block px-3 py-2.5 hover:bg-panel-2">
                      <span className="flex items-center gap-2 text-[12.5px]">
                        <span className="tnum text-ink-2">{formatDate(v.data)}</span>
                        <span className="text-muted">{v.orgao}</span>
                        <span className="ml-auto">
                          <ResultadoChip aprovada={v.aprovada} />
                        </span>
                      </span>
                      <span className="mt-1 line-clamp-2 text-[13px] text-ink">{v.descricao}</span>
                      {v.nominal && v.placar && (
                        <span className="mt-1.5 block">
                          <PlacarMini {...v.placar} />
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
