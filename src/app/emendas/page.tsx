import { connection } from "next/server";
import { Suspense } from "react";
import { EmendasOrcamentoLista } from "@/components/EmendasOrcamentoLista";
import { type AutorLink, EmendasProjetoLista } from "@/components/EmendasProjetoLista";
import { Escaneando, FonteIndisponivel, PageHeader, SegLinks, TransparenciaAviso } from "@/components/ui";
import { chaveNome, indiceAutores, nomeDaAutoria } from "@/lib/autores";
import { addDays, today } from "@/lib/dates";
import { TIPOS_EMENDA_ORCAMENTO } from "@/lib/orcamento";
import { emendasRecentes } from "@/lib/perfil-senado";
import { buscarEmendas, ChaveRecusada, transparenciaDisponivel } from "@/lib/transparencia";

export const metadata = { title: "Emendas | Radar Legislativo" };

const PERIODOS = [30, 90, 180] as const;

async function Projetos({ dias }: { dias: number }) {
  const ate = today();
  const [lista, indice] = await Promise.all([emendasRecentes(addDays(ate, -dias), ate).catch(() => null), indiceAutores()]);
  if (!lista) return <FonteIndisponivel casa="Senado" />;
  const autores: Record<string, AutorLink> = {};
  for (const e of lista) {
    const m = indice[nomeDaAutoria(e.autoria)];
    if (m) autores[e.id] = { href: `/${m.casa}/parlamentares/${m.id}`, nome: m.nome };
  }
  return <EmendasProjetoLista itens={lista} mostrarAutor autores={autores} filtroInicial="concluidas" />;
}

async function Orcamento({ ano, autor, tipo }: { ano: number; autor?: string; tipo?: string }) {
  if (!transparenciaDisponivel()) return <TransparenciaAviso />;
  let r: Awaited<ReturnType<typeof buscarEmendas>>;
  try {
    r = await buscarEmendas({ ano, autor, tipo }, 10);
  } catch (err) {
    if (err instanceof ChaveRecusada) {
      return <p className="panel p-6 text-[14px] text-ink-2">{err.message} Troque a chave em Configurações.</p>;
    }
    return <FonteIndisponivel casa="Portal da Transparência" />;
  }
  const indice = await indiceAutores();
  const autores: Record<string, AutorLink> = {};
  for (const e of r.itens) {
    const m = indice[chaveNome(e.autor)];
    if (m) autores[e.autor] = { href: `/${m.casa}/parlamentares/${m.id}`, nome: m.nome };
  }
  return (
    <div className="space-y-3">
      {r.truncado && (
        <p className="text-[12.5px] text-amber">
          A consulta trouxe mais resultados do que o limite de leitura. Mostrando os primeiros {r.itens.length}; filtre por
          autor ou tipo para ver o restante.
        </p>
      )}
      <EmendasOrcamentoLista itens={r.itens} mostrarAutor autores={autores} />
    </div>
  );
}

export default async function EmendasPage({ searchParams }: PageProps<"/emendas">) {
  await connection();
  const sp = await searchParams;
  const aba = sp.aba === "orcamento" ? "orcamento" : "projetos";
  const dias = PERIODOS.find((p) => String(p) === sp.periodo) ?? 90;
  const anoAtual = Number(today().slice(0, 4));
  const ano = [anoAtual, anoAtual - 1, anoAtual - 2].find((a) => String(a) === sp.ano) ?? anoAtual;
  const autor = typeof sp.autor === "string" && sp.autor.trim() ? sp.autor.trim() : undefined;
  const tipo = typeof sp.tipo === "string" && TIPOS_EMENDA_ORCAMENTO.includes(sp.tipo) ? sp.tipo : undefined;

  return (
    <>
      <PageHeader
        title="Emendas"
        lead={
          aba === "projetos"
            ? "Mudanças propostas ao texto de projetos e medidas provisórias no Senado e nas comissões mistas do Congresso, com quem propôs e o que foi decidido."
            : "Recursos do Orçamento da União indicados por parlamentares, bancadas e comissões, e quanto já foi pago."
        }
      >
        <SegLinks
          label="Tipo de emenda"
          items={[
            { href: "/emendas", label: "A projetos", active: aba === "projetos" },
            { href: "/emendas?aba=orcamento", label: "Ao orçamento", active: aba === "orcamento" },
          ]}
        />
      </PageHeader>

      {aba === "projetos" ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <SegLinks
              label="Período"
              items={PERIODOS.map((p) => ({ href: `/emendas?periodo=${p}`, label: `${p} dias`, active: p === dias }))}
            />
            <p className="max-w-[80ch] text-[12.5px] text-muted">
              Emendas apresentadas nos últimos {dias} dias. As apresentadas na Câmara não entram aqui, porque a Câmara não publica o resultado delas nos dados abertos. Elas
              aparecem no perfil de cada deputado.
            </p>
          </div>
          <Suspense key={dias} fallback={<Escaneando label="Lendo emendas e decisões no Senado e no Congresso" linhas={5} />}>
            <Projetos dias={dias} />
          </Suspense>
        </>
      ) : (
        <>
          <form method="get" className="panel mb-4 flex flex-wrap items-end gap-3 p-4 text-[13px]">
            <input type="hidden" name="aba" value="orcamento" />
            <label className="flex flex-col gap-1 text-ink-2">
              Ano
              <select name="ano" defaultValue={ano} className="rounded-md border border-line bg-bg px-2 py-1.5 text-ink">
                {[anoAtual, anoAtual - 1, anoAtual - 2].map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-ink-2">
              Tipo
              <select name="tipo" defaultValue={tipo ?? ""} className="rounded-md border border-line bg-bg px-2 py-1.5 text-ink">
                <option value="">Todos os tipos</option>
                {TIPOS_EMENDA_ORCAMENTO.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/^Emenda /, "")}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-ink-2">
              Autor
              <input
                name="autor"
                defaultValue={autor}
                placeholder="Nome do parlamentar, bancada ou comissão"
                className="rounded-md border border-line bg-bg px-3 py-1.5 text-ink placeholder:text-muted"
              />
            </label>
            <button type="submit" className="rounded-md bg-phosphor px-4 py-1.5 font-semibold text-bg hover:brightness-110">
              Buscar emendas
            </button>
          </form>
          <Suspense key={`${ano}-${autor}-${tipo}`} fallback={<Escaneando label="Consultando o Portal da Transparência" linhas={5} />}>
            <Orcamento ano={ano} autor={autor} tipo={tipo} />
          </Suspense>
        </>
      )}
    </>
  );
}
