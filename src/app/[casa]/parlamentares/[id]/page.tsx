import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { EmendasOrcamentoLista } from "@/components/EmendasOrcamentoLista";
import { EmendasProjetoLista } from "@/components/EmendasProjetoLista";
import { GastosPainel } from "@/components/GastosPainel";
import { Escaneando, FonteIndisponivel, SegLinks, TransparenciaAviso } from "@/components/ui";
import { VotosHistorico } from "@/components/VotosHistorico";
import { formatDate, today } from "@/lib/dates";
import { corPartido, UF_NOME } from "@/lib/partidos";
import { autoria, emendasProjeto, gastos, historicoVotos, JANELA_VOTOS, perfil, vinculos } from "@/lib/perfil";
import { ChaveRecusada, emendasDoParlamentar, transparenciaDisponivel } from "@/lib/transparencia";
import { type Casa, CASA_CURTA, isCasa, type Perfil } from "@/lib/types";

const ABAS = [
  { id: "votos", label: "Votos" },
  { id: "autoria", label: "Projetos de autoria" },
  { id: "emendas", label: "Emendas a projetos" },
  { id: "orcamento", label: "Emendas ao orçamento" },
  { id: "gastos", label: "Gastos da cota" },
  { id: "vinculos", label: "Comissões e frentes" },
] as const;
type Aba = (typeof ABAS)[number]["id"];

export async function generateMetadata({ params }: PageProps<"/[casa]/parlamentares/[id]">) {
  const { casa, id } = await params;
  if (!isCasa(casa)) return { title: "Radar Legislativo" };
  const p = await perfil(casa, id).catch(() => null);
  return { title: p ? `${p.nome} | Radar Legislativo` : "Parlamentar | Radar Legislativo" };
}

function idade(nasc?: string) {
  if (!nasc) return null;
  const [y, m, d] = nasc.split("-").map(Number);
  const [ty, tm, td] = today().split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

const rede = (u: string) => {
  const h = u.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
  if (/twitter|x\.com/.test(h)) return "X (Twitter)";
  if (/facebook/.test(h)) return "Facebook";
  if (/instagram/.test(h)) return "Instagram";
  if (/youtube|youtu\.be/.test(h)) return "YouTube";
  if (/tiktok/.test(h)) return "TikTok";
  if (/threads/.test(h)) return "Threads";
  return h;
};

function Cabecalho({ p }: { p: Perfil }) {
  const anos = idade(p.nascimento);
  const fatos: [string, React.ReactNode][] = [
    ...(p.nomeCivil ? ([["Nome civil", p.nomeCivil.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())]] as [string, string][]) : []),
    ...(p.nascimento
      ? ([["Nascimento", `${formatDate(p.nascimento)}${anos ? `, ${anos} anos` : ""}${p.naturalidade ? `, ${p.naturalidade}` : ""}`]] as [string, string][])
      : []),
    ...(p.escolaridade ? ([["Escolaridade", p.escolaridade]] as [string, string][]) : []),
    ...(p.formacao.length ? ([["Formação", p.formacao.join("; ")]] as [string, string][]) : []),
    ...(p.profissoes.length ? ([["Profissão", p.profissoes.join(", ")]] as [string, string][]) : []),
    ...(p.mandato ? ([["Mandato", `${p.mandato}${p.situacao ? ` (${p.situacao.toLowerCase()})` : ""}`]] as [string, string][]) : []),
  ];
  const contatos: [string, React.ReactNode][] = [
    ...(p.email ? ([["E-mail", <a key="e" href={`mailto:${p.email}`} className="text-phosphor hover:underline">{p.email}</a>]] as [string, React.ReactNode][]) : []),
    ...(p.telefone ? ([["Telefone", p.telefone]] as [string, string][]) : []),
    ...(p.gabinete ? ([["Gabinete", p.gabinete]] as [string, string][]) : []),
  ];

  return (
    <header className="panel radar-grid mb-6 grid gap-6 p-5 sm:p-6 lg:grid-cols-[auto_1fr_minmax(260px,340px)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={p.foto}
        alt={`Foto de ${p.nome}`}
        width={120}
        height={150}
        className="h-[150px] w-[120px] rounded-xl bg-line object-cover"
        style={{ boxShadow: `0 0 0 3px var(--panel), 0 0 0 5px ${corPartido(p.partido)}` }}
      />
      <div className="min-w-0">
        <p className="text-[13px] text-ink-2">{p.casa === "camara" ? "Deputado(a) federal" : "Senador(a)"}</p>
        <h1 className="font-display text-[clamp(28px,3.6vw,42px)] font-semibold leading-[1.05]">{p.nome}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[14px]">
          <span className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5">
            <span className="h-2 w-2 rounded-full" style={{ background: corPartido(p.partido) }} aria-hidden />
            {p.partido}
          </span>
          <span className="rounded-full border border-line px-2.5 py-0.5">{UF_NOME[p.uf] ?? p.uf}</span>
        </p>
        <dl className="mt-4 grid gap-x-4 gap-y-1.5 text-[13.5px] sm:grid-cols-[110px_1fr]">
          {fatos.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="space-y-3 text-[13.5px]">
        <dl className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5">
          {contatos.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="min-w-0 break-words text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
          <li>
            <a href={p.urlOficial} target="_blank" rel="noreferrer" className="text-phosphor hover:underline">
              Página oficial
            </a>
          </li>
          {p.site && (
            <li>
              <a href={p.site} target="_blank" rel="noreferrer" className="text-phosphor hover:underline">
                Site
              </a>
            </li>
          )}
          {p.redes.map((r) => (
            <li key={r}>
              <a href={r} target="_blank" rel="noreferrer" className="text-phosphor hover:underline">
                {rede(r)}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}

async function AbaVotos({ casa, id }: { casa: Casa; id: string }) {
  const h = await historicoVotos(casa, id).catch(() => null);
  if (!h) return <FonteIndisponivel casa={CASA_CURTA[casa]} />;
  return <VotosHistorico casa={casa} itens={h} dias={JANELA_VOTOS[casa]} />;
}

async function AbaAutoria({ casa, id }: { casa: Casa; id: string }) {
  const a = await autoria(casa, id).catch(() => null);
  if (!a) return <FonteIndisponivel casa={CASA_CURTA[casa]} />;
  if (!a.length) return <p className="panel p-6 text-[14px] text-ink-2">Nenhum projeto de autoria apresentado nesta legislatura.</p>;
  return (
    <div>
      <p className="mb-3 text-[13px] text-muted">
        {a.length} projetos de lei, PECs, projetos de lei complementar e de decreto legislativo apresentados desde 2023, como autor
        ou coautor.
      </p>
      <ul className="panel divide-y divide-line overflow-hidden">
        {a.map((p) => (
          <li key={p.id}>
            <Link href={`/${casa}/proposicoes/${p.id}`} className="grid gap-x-4 gap-y-1 px-4 py-2.5 hover:bg-panel-2 sm:grid-cols-[130px_1fr]">
              <span>
                <span className="block font-display text-[14px] font-semibold text-ink">{p.sigla}</span>
                <span className="tnum text-[12px] text-ink-2">{p.data ? formatDate(p.data) : ""}</span>
              </span>
              <span className="min-w-0">
                <span className="line-clamp-2 text-[13.5px] text-ink-2">{p.ementa}</span>
                {p.situacao && <span className="mt-0.5 block text-[12px] text-muted">{p.situacao}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function AbaEmendas({ casa, id }: { casa: Casa; id: string }) {
  const e = await emendasProjeto(casa, id).catch(() => null);
  if (!e) return <FonteIndisponivel casa={CASA_CURTA[casa]} />;
  return <EmendasProjetoLista itens={e} />;
}

async function AbaOrcamento({ p }: { p: Perfil }) {
  if (!transparenciaDisponivel()) return <TransparenciaAviso />;
  const ano = Number(today().slice(0, 4));
  let r: Awaited<ReturnType<typeof emendasDoParlamentar>>;
  try {
    r = await emendasDoParlamentar([p.nome, p.nomeCivil ?? ""], [ano, ano - 1]);
  } catch (err) {
    if (err instanceof ChaveRecusada) {
      return <p className="panel p-6 text-[14px] text-ink-2">{err.message} Troque a chave em Configurações.</p>;
    }
    return <FonteIndisponivel casa="Portal da Transparência" />;
  }
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">
        Emendas individuais de {ano - 1} e {ano} no Portal da Transparência
        {r.nomeUsado ? `, autor registrado como "${r.nomeUsado}"` : ""}. Emendas de bancada e de comissão aparecem na página
        Emendas.
      </p>
      <EmendasOrcamentoLista itens={r.itens} />
    </div>
  );
}

async function AbaGastos({ casa, id }: { casa: Casa; id: string }) {
  const g = await gastos(casa, id).catch(() => null);
  if (!g) return <FonteIndisponivel casa={CASA_CURTA[casa]} />;
  return (
    <GastosPainel
      g={g}
      fonte={casa === "camara" ? "Cota para o Exercício da Atividade Parlamentar, Câmara" : "CEAPS, Senado Federal"}
    />
  );
}

async function AbaVinculos({ casa, id }: { casa: Casa; id: string }) {
  const v = await vinculos(casa, id).catch(() => null);
  if (!v) return <FonteIndisponivel casa={CASA_CURTA[casa]} />;
  const atuais = v.comissoes.filter((c) => !c.fim || c.fim >= today());
  const antigas = v.comissoes.filter((c) => c.fim && c.fim < today());
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h2 className="mb-2 font-display text-[15px] font-semibold">Comissões atuais</h2>
        {atuais.length === 0 ? (
          <p className="text-[13.5px] text-ink-2">Nenhuma comissão em andamento.</p>
        ) : (
          <ul className="panel divide-y divide-line">
            {atuais.map((c) => (
              <li key={`${c.sigla}-${c.inicio}`} className="flex items-baseline gap-3 px-4 py-2 text-[13.5px]">
                <span className="w-20 shrink-0 font-medium text-ink">{c.sigla}</span>
                <span className="min-w-0 flex-1 text-ink-2">{c.nome}</span>
                {c.papel && <span className="shrink-0 text-[12px] text-ink">{c.papel}</span>}
              </li>
            ))}
          </ul>
        )}
        {antigas.length > 0 && (
          <details className="mt-3 text-[13px]">
            <summary className="cursor-pointer text-phosphor">Comissões anteriores nesta legislatura ({antigas.length})</summary>
            <ul className="mt-2 space-y-1 text-ink-2">
              {antigas.map((c) => (
                <li key={`${c.sigla}-${c.inicio}`}>
                  <span className="text-ink">{c.sigla}</span> {c.nome}
                  {c.papel ? `, ${c.papel.toLowerCase()}` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
      <section className="space-y-6">
        {v.filiacoes.length > 0 && (
          <div>
            <h2 className="mb-2 font-display text-[15px] font-semibold">Filiações partidárias</h2>
            <ol className="relative space-y-2 border-l border-line pl-4 text-[13.5px]">
              {v.filiacoes.map((f) => (
                <li key={`${f.partido}-${f.inicio}`} className="relative">
                  <span
                    className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-bg"
                    style={{ background: corPartido(f.partido) }}
                    aria-hidden
                  />
                  <span className="text-ink">{f.partido}</span>{" "}
                  <span className="tnum text-ink-2">
                    {formatDate(f.inicio)} a {f.fim ? formatDate(f.fim) : "hoje"}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
        <div>
          <h2 className="mb-2 font-display text-[15px] font-semibold">
            {casa === "camara" ? "Frentes parlamentares" : "Grupos e frentes parlamentares"}{" "}
            <span className="tnum text-[13px] font-normal text-muted">{v.frentes.length}</span>
          </h2>
          {v.frentes.length === 0 ? (
            <p className="text-[13.5px] text-ink-2">Nenhuma registrada.</p>
          ) : (
            <details className="text-[13px]" open={v.frentes.length <= 15}>
              <summary className="cursor-pointer text-phosphor">
                {v.frentes.length <= 15 ? "Lista" : `Ver todas as ${v.frentes.length}`}
              </summary>
              <ul className="mt-2 columns-1 gap-6 space-y-1 text-ink-2 sm:columns-2">
                {v.frentes.map((f, i) => (
                  <li key={i} className="break-inside-avoid">
                    {f.nome}
                    {f.papel && f.papel !== "Titular" && f.papel !== "Membro" ? <span className="text-ink">, {f.papel.toLowerCase()}</span> : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </section>
    </div>
  );
}

export default async function ParlamentarPage({ params, searchParams }: PageProps<"/[casa]/parlamentares/[id]">) {
  const { casa, id } = await params;
  if (!isCasa(casa) || !/^\d+$/.test(id)) notFound();
  await connection();
  const sp = await searchParams;
  const aba: Aba = ABAS.some((a) => a.id === sp.aba) ? (sp.aba as Aba) : "votos";

  let p: Perfil;
  try {
    p = await perfil(casa, id);
  } catch {
    return <FonteIndisponivel casa={CASA_CURTA[casa]} />;
  }

  const lentas: Partial<Record<Aba, string>> = {
    votos:
      casa === "camara"
        ? "Cruzando as votações nominais dos últimos 120 dias. A primeira carga leva até um minuto; depois fica em cache."
        : "Lendo as votações nominais do último ano",
    gastos: "Somando as despesas da cota parlamentar",
    orcamento: "Consultando o Portal da Transparência",
  };

  return (
    <>
      <nav className="mb-4 text-[13px]">
        <Link href={`/${casa}`} className="text-ink-2 hover:text-ink">
          ← {casa === "camara" ? "Deputados" : "Senadores"}
        </Link>
      </nav>
      <Cabecalho p={p} />
      <div className="mb-5 overflow-x-auto">
        <SegLinks
          label="Seções do perfil"
          items={ABAS.map((a) => ({
            href: `/${casa}/parlamentares/${id}${a.id === "votos" ? "" : `?aba=${a.id}`}`,
            label: a.label,
            active: a.id === aba,
          }))}
        />
      </div>
      <Suspense key={aba} fallback={<Escaneando label={lentas[aba] ?? "Carregando"} linhas={4} />}>
        {aba === "votos" && <AbaVotos casa={casa} id={id} />}
        {aba === "autoria" && <AbaAutoria casa={casa} id={id} />}
        {aba === "emendas" && <AbaEmendas casa={casa} id={id} />}
        {aba === "orcamento" && <AbaOrcamento p={p} />}
        {aba === "gastos" && <AbaGastos casa={casa} id={id} />}
        {aba === "vinculos" && <AbaVinculos casa={casa} id={id} />}
      </Suspense>
    </>
  );
}
