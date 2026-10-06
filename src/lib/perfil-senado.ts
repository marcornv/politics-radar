import { cached, HOUR } from "./cache";
import { addDays, today } from "./dates";
import { agregarGastos, type LinhaGasto } from "./gastos";
import { asArray, getJson } from "./http";
import { normalizarPartido } from "./partidos";
import { get, resumo, ROTULO, tipoVoto, votacoesRaw } from "./senado";
import type { Autoria, EmendaProjeto, Filiacao, Gastos, Perfil, ResultadoEmenda, Vinculo, VotoHistorico } from "./types";

const INICIO_LEGISLATURA = "2023-02-01";

type Comissao = {
  IdentificacaoComissao: { SiglaComissao: string; NomeComissao: string; SiglaCasaComissao?: string };
  DescricaoParticipacao?: string;
  DescricaoCargo?: string;
  DataInicio?: string;
  DataFim?: string;
};

type Detalhe = {
  DetalheParlamentar: {
    Parlamentar: {
      IdentificacaoParlamentar: {
        CodigoParlamentar: string;
        NomeParlamentar: string;
        NomeCompletoParlamentar?: string;
        UrlFotoParlamentar?: string;
        UrlPaginaParlamentar?: string;
        EmailParlamentar?: string;
        SiglaPartidoParlamentar?: string;
        UfParlamentar: string;
      };
      DadosBasicosParlamentar?: {
        DataNascimento?: string;
        Naturalidade?: string;
        UfNaturalidade?: string;
        EnderecoParlamentar?: string;
      };
      Telefones?: { Telefone: { NumeroTelefone: string } | { NumeroTelefone: string }[] };
    };
  };
};

type Mandato = {
  DescricaoParticipacao?: string;
  PrimeiraLegislaturaDoMandato?: { DataInicio: string };
  SegundaLegislaturaDoMandato?: { DataFim: string };
};

function fone(n?: string) {
  if (!n) return undefined;
  const d = n.replace(/\D/g, "");
  return d.length === 8 ? `(61) ${d.slice(0, 4)}-${d.slice(4)}` : n;
}

export async function perfil(id: string): Promise<Perfil> {
  const [det, acad, prof, mand] = await Promise.all([
    cached(`senado:perfil:${id}`, 12 * HOUR, () => get<Detalhe>(`/senador/${id}.json`)),
    cached(`senado:academico:${id}`, 24 * HOUR, () =>
      get<{ HistoricoAcademicoParlamentar: { Parlamentar: { HistoricoAcademico?: { Curso: unknown } } } }>(
        `/senador/${id}/historicoAcademico.json`,
      ),
    ).catch(() => null),
    cached(`senado:profissao:${id}`, 24 * HOUR, () =>
      get<Record<string, { Parlamentar: { Profissoes?: { Profissao: unknown } } }>>(`/senador/${id}/profissao.json`),
    ).catch(() => null),
    cached(`senado:mandatos:${id}`, 24 * HOUR, () =>
      get<{ MandatoParlamentar: { Parlamentar: { Mandatos?: { Mandato: Mandato | Mandato[] } } } }>(
        `/senador/${id}/mandatos.json`,
      ),
    ).catch(() => null),
  ]);

  const p = det.DetalheParlamentar.Parlamentar;
  const ip = p.IdentificacaoParlamentar;
  const db = p.DadosBasicosParlamentar;
  const cursos = asArray(
    acad?.HistoricoAcademicoParlamentar?.Parlamentar?.HistoricoAcademico?.Curso as
      | { NomeCurso: string; Estabelecimento?: string }[]
      | undefined,
  );
  const profissoes = asArray(
    (prof ? Object.values(prof)[0]?.Parlamentar?.Profissoes?.Profissao : undefined) as { NomeProfissao: string }[] | undefined,
  );
  const mandatos = asArray(mand?.MandatoParlamentar?.Parlamentar?.Mandatos?.Mandato);
  const atual = mandatos[0];
  const ini = atual?.PrimeiraLegislaturaDoMandato?.DataInicio?.slice(0, 4);
  const fim = atual?.SegundaLegislaturaDoMandato?.DataFim?.slice(0, 4);

  return {
    id: ip.CodigoParlamentar,
    casa: "senado",
    nome: ip.NomeParlamentar,
    nomeCivil: ip.NomeCompletoParlamentar,
    partido: normalizarPartido(ip.SiglaPartidoParlamentar),
    uf: ip.UfParlamentar,
    foto: ip.UrlFotoParlamentar?.replace("http://", "https://"),
    url: ip.UrlPaginaParlamentar?.replace("http://", "https://"),
    urlOficial: ip.UrlPaginaParlamentar?.replace("http://", "https://") ?? `https://www25.senado.leg.br/web/senadores/senador/-/perfil/${id}`,
    nascimento: db?.DataNascimento,
    naturalidade: db?.Naturalidade ? `${db.Naturalidade}/${db.UfNaturalidade}` : undefined,
    formacao: cursos.map((c) => (c.Estabelecimento ? `${c.NomeCurso} (${c.Estabelecimento})` : c.NomeCurso)),
    profissoes: profissoes.map((x) => x.NomeProfissao),
    email: ip.EmailParlamentar,
    telefone: fone(asArray(p.Telefones?.Telefone)[0]?.NumeroTelefone),
    gabinete: db?.EnderecoParlamentar?.replace(/\s+/g, " ").trim(),
    redes: [],
    situacao: atual?.DescricaoParticipacao,
    mandato: ini && fim ? `${ini} a ${fim}` : undefined,
  };
}

export function vinculos(id: string): Promise<{ comissoes: Vinculo[]; frentes: Vinculo[]; filiacoes: Filiacao[] }> {
  return cached(`senado:vinculos:${id}`, 12 * HOUR, async () => {
    const [com, cargos, fil] = await Promise.all([
      get<{ MembroComissaoParlamentar: { Parlamentar: { MembroComissoes?: { Comissao: Comissao | Comissao[] } } } }>(
        `/senador/${id}/comissoes.json`,
      ).catch(() => null),
      get<{ CargoParlamentar: { Parlamentar: { Cargos?: { Cargo: Comissao | Comissao[] } } } }>(
        `/senador/${id}/cargos.json`,
      ).catch(() => null),
      get<{
        FiliacaoParlamentar: {
          Parlamentar: {
            Filiacoes?: {
              Filiacao:
                | { Partido: { SiglaPartido: string }; DataFiliacao: string; DataDesfiliacao?: string }
                | { Partido: { SiglaPartido: string }; DataFiliacao: string; DataDesfiliacao?: string }[];
            };
          };
        };
      }>(`/senador/${id}/filiacoes.json`).catch(() => null),
    ]);

    const cargoPor = new Map<string, string>();
    for (const c of asArray(cargos?.CargoParlamentar?.Parlamentar?.Cargos?.Cargo)) {
      if (!c.DataFim && c.DescricaoCargo) cargoPor.set(c.IdentificacaoComissao.SiglaComissao, c.DescricaoCargo);
    }
    const todas = asArray(com?.MembroComissaoParlamentar?.Parlamentar?.MembroComissoes?.Comissao).filter(
      (c) => !c.DataFim || c.DataFim >= today(),
    );
    const vinc = (c: Comissao): Vinculo => {
      const cargo = cargoPor.get(c.IdentificacaoComissao.SiglaComissao);
      return {
        sigla: c.IdentificacaoComissao.SiglaComissao,
        nome: c.IdentificacaoComissao.NomeComissao,
        papel: cargo ? cargo.charAt(0) + cargo.slice(1).toLowerCase() : c.DescricaoParticipacao,
        inicio: c.DataInicio,
        fim: c.DataFim,
      };
    };
    // Parliamentary groups and fronts (GP*, FP*) are listed separately from working committees.
    const ehGrupo = (c: Comissao) => /^(GP|FP|FRENTE)/i.test(c.IdentificacaoComissao.SiglaComissao) || /grupo parlamentar|frente parlamentar/i.test(c.IdentificacaoComissao.NomeComissao);
    return {
      comissoes: todas.filter((c) => !ehGrupo(c)).map(vinc),
      frentes: todas.filter(ehGrupo).map(vinc),
      filiacoes: asArray(fil?.FiliacaoParlamentar?.Parlamentar?.Filiacoes?.Filiacao).map((f) => ({
        partido: normalizarPartido(f.Partido.SiglaPartido),
        inicio: f.DataFiliacao,
        fim: f.DataDesfiliacao,
      })),
    };
  });
}

type ProcLista = { id: number; identificacao: string; ementa?: string; dataApresentacao?: string; situacaoAtual?: string };

export function autoria(id: string): Promise<Autoria[]> {
  return cached(`senado:autoria:${id}`, 12 * HOUR, async () => {
    const r = await get<ProcLista[]>(
      `/processo?codigoParlamentarAutor=${id}&dataInicioApresentacao=${INICIO_LEGISLATURA}`,
    );
    return asArray(r)
      .filter((p) => /^(PL|PLP|PEC|PDL|PRS|PLS) /.test(p.identificacao))
      .map((p) => ({
        id: String(p.id),
        sigla: p.identificacao,
        ementa: p.ementa ?? "",
        data: p.dataApresentacao ?? "",
        situacao: p.situacaoAtual ? p.situacaoAtual.charAt(0) + p.situacaoAtual.slice(1).toLowerCase() : undefined,
      }))
      .sort((a, b) => b.data.localeCompare(a.data));
  });
}

// ---------------------------------------------------------------- emendas a projetos

type EmendaRaw = {
  id: number;
  autoria: string;
  dataApresentacao: string;
  decisoes?: { data: string; descricaoTipo: string; siglaColegiado?: string }[] | null;
  identificacao: string;
  idProcesso: number;
  siglaColegiado?: string;
  descricaoDocumentoEmenda?: string;
  urlDocumentoEmenda?: string;
};

function resultado(t: string | undefined): ResultadoEmenda {
  const s = (t ?? "").toLowerCase();
  if (!s) return "pendente";
  if (s.includes("parcial")) return "parcial";
  if (s.startsWith("aprovad") || s.startsWith("acolhid")) return "aprovada";
  if (s.startsWith("rejeitad")) return "rejeitada";
  if (s.startsWith("prejudicad")) return "prejudicada";
  if (s.startsWith("retirad")) return "retirada";
  if (s.includes("parcial")) return "parcial";
  return "desconhecido";
}

export function emendaDe(e: EmendaRaw): EmendaProjeto {
  const dec = e.decisoes?.at(-1);
  const sigla = e.identificacao.split(" - ").slice(1).join(" - ");
  return {
    id: String(e.id),
    casa: "senado",
    identificacao: e.identificacao,
    autoria: e.autoria,
    data: e.dataApresentacao,
    colegiado: e.siglaColegiado,
    emendado: sigla ? { id: String(e.idProcesso), sigla } : undefined,
    resultado: resultado(dec?.descricaoTipo),
    resultadoTexto: dec?.descricaoTipo?.trim(),
    dataResultado: dec?.data,
    url: e.urlDocumentoEmenda?.replace("http://", "https://"),
  };
}

export function emendasProjeto(id: string): Promise<EmendaProjeto[]> {
  return cached(`senado:emendasprojeto:${id}`, 12 * HOUR, async () => {
    const r = await get<EmendaRaw[]>(`/processo/emenda?codigoParlamentarAutor=${id}&dataInicio=${INICIO_LEGISLATURA}`);
    return asArray(r)
      .map(emendaDe)
      .sort((a, b) => b.data.localeCompare(a.data));
  });
}

export function emendasDoProcesso(idProcesso: string): Promise<EmendaProjeto[]> {
  return cached(`senado:emendasprocesso:${idProcesso}`, 6 * HOUR, async () => {
    const r = await get<EmendaRaw[]>(`/processo/emenda?idProcesso=${idProcesso}`);
    return asArray(r)
      .map(emendaDe)
      .sort((a, b) => b.data.localeCompare(a.data));
  });
}

/** Amendments filed in the Senate and in joint committees (MPs) in a date window. */
export function emendasRecentes(de: string, ate: string): Promise<EmendaProjeto[]> {
  return cached(`senado:emendasrecentes:${de}:${ate}`, 2 * HOUR, async () => {
    const r = await get<EmendaRaw[]>(`/processo/emenda?dataInicio=${de}&dataFim=${ate}`);
    return asArray(r)
      .map(emendaDe)
      .sort((a, b) => (b.dataResultado ?? b.data).localeCompare(a.dataResultado ?? a.data));
  });
}

// ---------------------------------------------------------------- gastos (CEAPS)

type CeapsRaw = {
  codSenador: number;
  tipoDespesa: string | null;
  fornecedor: string;
  data: string;
  ano: number;
  mes: number;
  valorReembolsado: number;
};

type Compacto = { c: number; d: string; t: string; f: string; v: number };

/** One year of quota spending for all senators, kept compact on disk. */
function ceapsAno(ano: number) {
  const ttl = ano < Number(today().slice(0, 4)) ? 7 * 24 * HOUR : 12 * HOUR;
  return cached(`senado:ceaps:${ano}`, ttl, async () => {
    const r = await getJson<CeapsRaw[]>(
      `https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${ano}`,
      { timeoutMs: 60_000 },
    );
    return r.map(
      (x): Compacto => ({
        c: x.codSenador,
        d: x.data?.slice(0, 10) || `${x.ano}-${String(x.mes).padStart(2, "0")}-01`,
        t: x.tipoDespesa ?? "Outros",
        f: x.fornecedor ?? "",
        v: x.valorReembolsado ?? 0,
      }),
    );
  });
}

export async function gastos(id: string): Promise<Gastos> {
  const hoje = today();
  const desde = `${addDays(hoje, -365).slice(0, 7)}-01`;
  const anos = [...new Set([Number(desde.slice(0, 4)), Number(hoje.slice(0, 4))])];
  const linhas: LinhaGasto[] = [];
  for (const ano of anos) {
    const rows = await ceapsAno(ano).catch(() => [] as Compacto[]);
    for (const r of rows)
      if (String(r.c) === id) linhas.push({ data: r.d, categoria: r.t, fornecedor: r.f, valor: r.v });
  }
  return agregarGastos(linhas, desde);
}

// ---------------------------------------------------------------- votos

export async function historicoVotos(id: string, dias = 365): Promise<VotoHistorico[]> {
  const ate = today();
  const lista = await votacoesRaw(addDays(ate, -dias), ate);
  const out: VotoHistorico[] = [];
  for (const v of lista) {
    const meu = v.votos.find((x) => String(x.codigoParlamentar) === id);
    if (!meu) continue;
    out.push({
      votacao: resumo(v),
      voto: tipoVoto(meu.siglaVotoParlamentar),
      rotulo: meu.descricaoVotoParlamentar || ROTULO[meu.siglaVotoParlamentar] || meu.siglaVotoParlamentar,
    });
  }
  return out.sort((a, b) => b.votacao.data.localeCompare(a.votacao.data));
}
