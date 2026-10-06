import { cached, HOUR, MIN, mapLimit } from "./cache";
import { addDays, compact, today } from "./dates";
import { classificar } from "./fase";
import { asArray, getJson } from "./http";
import { normalizarPartido } from "./partidos";
import type {
  Comissao,
  EventoAgenda,
  ItemPauta,
  Orientacao,
  Parlamentar,
  ProposicaoDetalhe,
  ProposicaoTramitando,
  TipoVoto,
  VotacaoDetalhe,
  VotacaoResumo,
  Voto,
} from "./types";

const BASE = "https://legis.senado.leg.br/dadosabertos";

export const get = <T>(path: string) => getJson<T>(`${BASE}${path}`);

// ---------------------------------------------------------------- senadores

type SenRaw = {
  IdentificacaoParlamentar: {
    CodigoParlamentar: string;
    NomeParlamentar: string;
    SiglaPartidoParlamentar?: string;
    UfParlamentar: string;
    UrlFotoParlamentar?: string;
    UrlPaginaParlamentar?: string;
  };
};

export function senadores(): Promise<Parlamentar[]> {
  return cached("senado:senadores", 12 * HOUR, async () => {
    const r = await get<{ ListaParlamentarEmExercicio: { Parlamentares: { Parlamentar: SenRaw[] } } }>(
      "/senador/lista/atual.json",
    );
    return asArray(r.ListaParlamentarEmExercicio.Parlamentares.Parlamentar).map(({ IdentificacaoParlamentar: p }) => ({
      id: p.CodigoParlamentar,
      nome: p.NomeParlamentar,
      partido: normalizarPartido(p.SiglaPartidoParlamentar),
      uf: p.UfParlamentar,
      foto: p.UrlFotoParlamentar?.replace("http://", "https://"),
      url: p.UrlPaginaParlamentar?.replace("http://", "https://"),
    }));
  });
}

// ---------------------------------------------------------------- votações

type VotoRaw = {
  codigoParlamentar: number;
  nomeParlamentar: string;
  siglaPartidoParlamentar: string;
  siglaUFParlamentar: string;
  siglaVotoParlamentar: string;
  descricaoVotoParlamentar?: string | null;
};

export type VotacaoRaw = {
  codigoSessao: number;
  codigoSessaoVotacao: number;
  sequencialVotacao: number;
  dataSessao: string;
  descricaoVotacao: string;
  ementa: string;
  idProcesso: number;
  identificacao: string;
  resultadoVotacao: string; // A = aprovada, R = rejeitada
  votacaoSecreta: string;
  totalVotosSim: number;
  totalVotosNao: number;
  totalVotosAbstencao: number;
  informeLegislativo?: { texto?: string; data?: string; siglaColegiado?: string };
  votos: VotoRaw[];
};

const idOf = (v: VotacaoRaw) => `${v.codigoSessao}-${v.codigoSessaoVotacao}`;

function contar(v: VotacaoRaw, sigla: string) {
  return v.votos.filter((x) => x.siglaVotoParlamentar.toLowerCase() === sigla).length;
}

export function resumo(v: VotacaoRaw): VotacaoResumo {
  // Some ballots come with null totals; count them from the individual votes.
  const placar =
    v.totalVotosSim == null
      ? { sim: contar(v, "sim"), nao: contar(v, "não"), abstencao: contar(v, "abstenção") }
      : { sim: v.totalVotosSim, nao: v.totalVotosNao, abstencao: v.totalVotosAbstencao ?? 0 };
  return {
    id: idOf(v),
    casa: "senado",
    data: v.dataSessao,
    orgao: v.informeLegislativo?.siglaColegiado ?? "PLEN",
    descricao: v.descricaoVotacao,
    aprovada: v.resultadoVotacao === "A" ? true : v.resultadoVotacao === "R" ? false : null,
    nominal: true,
    placar,
    proposicao: { id: String(v.idProcesso), sigla: v.identificacao, ementa: v.ementa },
  };
}

export function votacoesRaw(de: string, ate: string) {
  const ttl = ate >= addDays(today(), -1) ? 15 * MIN : 24 * HOUR;
  return cached(`senado:votacoes:${de}:${ate}`, ttl, async () => {
    const r = await get<VotacaoRaw[]>(`/votacao?dataInicio=${de}&dataFim=${ate}`);
    return asArray(r).sort((a, b) => b.sequencialVotacao - a.sequencialVotacao);
  });
}

export async function votacoes(de: string, ate: string): Promise<VotacaoResumo[]> {
  return (await votacoesRaw(de, ate)).map(resumo);
}

export function tipoVoto(sigla: string): TipoVoto {
  const s = sigla.toLowerCase();
  if (s === "sim") return "sim";
  if (s === "não" || s === "nao") return "nao";
  if (s.startsWith("abst")) return "abstencao";
  if (s.startsWith("obstr")) return "obstrucao";
  if (s.startsWith("presidente")) return "presidente";
  if (s === "votou") return "votou";
  return "ausente"; // P-NRV, AP, NCom, LS, MIS, LAP...
}

export const ROTULO: Record<string, string> = {
  "P-NRV": "Presente, não registrou voto",
  AP: "Atividade parlamentar",
  NCom: "Não compareceu",
  LS: "Licença saúde",
  LP: "Licença particular",
  MIS: "Missão",
  LAP: "Licença atividade parlamentar",
  REP: "Representação da Casa",
};

export async function votacao(id: string): Promise<VotacaoDetalhe | null> {
  const [codSessao, codVot] = id.split("-");
  const lista = await cached(`senado:votsessao:${codSessao}`, 6 * HOUR, () =>
    get<VotacaoRaw[]>(`/votacao?codigoSessao=${codSessao}`),
  );
  const v = asArray(lista).find((x) => String(x.codigoSessaoVotacao) === codVot);
  if (!v) return null;

  const votos: Voto[] = v.votos.map((x) => ({
    parlamentar: {
      id: String(x.codigoParlamentar),
      nome: x.nomeParlamentar,
      partido: normalizarPartido(x.siglaPartidoParlamentar),
      uf: x.siglaUFParlamentar,
      foto: `https://www.senado.leg.br/senadores/img/fotos-oficiais/senador${x.codigoParlamentar}.jpg`,
      url: `https://www25.senado.leg.br/web/senadores/senador/-/perfil/${x.codigoParlamentar}`,
    },
    voto: tipoVoto(x.siglaVotoParlamentar),
    rotulo: x.descricaoVotoParlamentar || ROTULO[x.siglaVotoParlamentar] || x.siglaVotoParlamentar,
  }));

  let orientacoes: Orientacao[] = [];
  try {
    const o = await cached(`senado:orient:${v.dataSessao}`, 24 * HOUR, () =>
      get<{ votacoes: { sequencialVotacao: number; orientacoesLideranca: { partido: string; voto: string }[] }[] }>(
        `/plenario/votacao/orientacaoBancada/${compact(v.dataSessao)}.json`,
      ),
    );
    const match = asArray(o.votacoes).find((x) => x.sequencialVotacao === v.sequencialVotacao);
    orientacoes = asArray(match?.orientacoesLideranca).map((x) => ({
      bancada: x.partido,
      orientacao: x.voto.charAt(0) + x.voto.slice(1).toLowerCase(),
    }));
  } catch {}

  const base = resumo(v);
  return {
    ...base,
    secreta: v.votacaoSecreta === "S",
    votos,
    orientacoes,
    relato: v.informeLegislativo?.texto?.trim(),
  };
}

// ---------------------------------------------------------------- agenda

type MateriaPlen = {
  CodigoMateria: string;
  DescricaoIdentificacaoMateria: string;
  Ementa?: string;
  Parecer?: string;
  NomeAutor?: string;
};

type SessaoPlen = {
  CodigoSessao: string;
  Data: string;
  Hora: string;
  TipoSessao: string;
  SituacaoSessao?: string;
  LocalSessao?: string;
  Casa?: string;
  Comunicado?: string;
  Materias?: { Materia: MateriaPlen | MateriaPlen[] };
};

type ItemCom = {
  nome: string;
  descricaoResultado?: string;
  relatorio?: string;
  doma?: { idProcesso?: string; ementa?: string; apelido?: string };
};

type ReuniaoCom = {
  codigo: string;
  titulo?: string;
  descricao?: string;
  informacao?: string;
  colegiadoCriador: { sigla: string; nome: string };
  dataInicio: string;
  situacao?: string;
  local?: string;
  tipo?: { descricao?: string; sigla?: string };
  partes?: { isDeliberativa?: string; itens?: ItemCom | ItemCom[] } | { isDeliberativa?: string; itens?: ItemCom | ItemCom[] }[];
};

function months(de: string, ate: string): string[] {
  const out: string[] = [];
  let d = `${de.slice(0, 7)}-01`;
  while (d <= ate) {
    out.push(d);
    const [y, m] = d.split("-").map(Number);
    d = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  }
  return out;
}

async function agendaPlenario(de: string, ate: string): Promise<EventoAgenda[]> {
  const sessoes: SessaoPlen[] = [];
  for (const m of months(de, ate)) {
    try {
      const r = await get<{ AgendaPlenario?: { Sessoes?: { Sessao: SessaoPlen | SessaoPlen[] } } }>(
        `/plenario/agenda/mes/${compact(m)}.json`,
      );
      sessoes.push(...asArray(r.AgendaPlenario?.Sessoes?.Sessao));
    } catch {}
  }
  return sessoes
    .filter((s) => s.Data >= de && s.Data <= ate)
    .map((s) => {
      const tipo = s.TipoSessao.trim();
      const pauta: ItemPauta[] = asArray(s.Materias?.Materia).map((m) => ({
        titulo: m.DescricaoIdentificacaoMateria,
        ementa: m.Ementa?.trim(),
        proposicaoId: `m${m.CodigoMateria}`,
        situacao: m.Parecer?.trim(),
      }));
      return {
        id: `s${s.CodigoSessao}`,
        casa: "senado" as const,
        inicio: `${s.Data}T${(s.Hora || "00:00").trim()}`,
        titulo: tipo.charAt(0) + tipo.slice(1).toLowerCase(),
        orgao: s.Casa === "CN" ? "CN" : "PLEN",
        orgaoNome: s.Casa === "CN" ? "Congresso Nacional" : "Plenário do Senado",
        situacao: s.SituacaoSessao?.trim() || "Agendada",
        deliberativo: /deliberativa/i.test(tipo) && !/n[ãa]o deliberativa/i.test(tipo),
        local: s.LocalSessao,
        url: `https://www25.senado.leg.br/web/atividade/sessao-plenaria/-/pauta/${s.CodigoSessao}`,
        pauta,
      };
    });
}

async function agendaComissoes(de: string, ate: string): Promise<EventoAgenda[]> {
  const r = await get<{ AgendaReuniao?: { reunioes?: { reuniao: ReuniaoCom | ReuniaoCom[] } } }>(
    `/comissao/agenda/${compact(de)}/${compact(ate)}.json`,
  );
  return asArray(r.AgendaReuniao?.reunioes?.reuniao).map((x) => {
    const partes = asArray(x.partes);
    const pauta: ItemPauta[] = partes.flatMap((p) =>
      asArray(p.itens).map((it) => ({
        titulo: it.nome,
        ementa: it.doma?.apelido || it.doma?.ementa,
        proposicaoId: it.doma?.idProcesso,
        situacao: it.descricaoResultado || it.relatorio,
      })),
    );
    const deliberativo = partes.some((p) => p.isDeliberativa === "true");
    return {
      id: `r${x.codigo}`,
      casa: "senado" as const,
      inicio: x.dataInicio.replace(/\.\d+$/, ""),
      titulo: x.informacao?.trim() || x.descricao?.trim() || x.tipo?.descricao || x.titulo || "Reunião",
      orgao: x.colegiadoCriador.sigla,
      orgaoNome: x.colegiadoCriador.nome,
      situacao: x.situacao ?? "",
      deliberativo,
      local: x.local,
      url: `https://legis.senado.leg.br/comissoes/reuniao?reuniao=${x.codigo}`,
      pauta,
    };
  });
}

export function agenda(de: string, ate: string): Promise<EventoAgenda[]> {
  const ttl = ate >= today() ? 20 * MIN : 24 * HOUR;
  return cached(`senado:agenda:${de}:${ate}`, ttl, async () => {
    const [p, c] = await Promise.all([
      agendaPlenario(de, ate).catch(() => []),
      agendaComissoes(de, ate).catch(() => []),
    ]);
    return [...p, ...c].sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
  });
}

// ---------------------------------------------------------------- tramitação

type ProcLista = {
  id: number;
  identificacao: string;
  ementa?: string;
  autoria?: string;
  situacaoAtual?: string;
  dataSituacaoAtual?: string;
  dataUltimaAtualizacao?: string;
};

type Colegiado = { Codigo: string; Sigla: string; Nome: string; SiglaTipoColegiado: string; SiglaCasa: string };

export function comissoes(): Promise<Comissao[]> {
  return cached("senado:comissoes", 24 * HOUR, async () => {
    const r = await get<{ ListaColegiados: { Colegiados: { Colegiado: Colegiado[] } } }>("/comissao/lista/colegiados");
    return asArray(r.ListaColegiados.Colegiados.Colegiado)
      .filter((c) => c.SiglaTipoColegiado === "PERMANENTE" && c.SiglaCasa === "SF")
      .map((c) => ({ id: c.Codigo, sigla: c.Sigla, nome: c.Nome }));
  });
}

const PLENARIO: Comissao = { id: "1998", sigla: "PLEN", nome: "Plenário do Senado" };

export const TIPOS_PADRAO = ["PL", "PLP", "PEC", "MPV", "PDL", "PLS"];

/**
 * Bills sitting in each permanent committee and in the plenary. The full
 * backlog is huge (thousands waiting for a rapporteur, hundreds "ready" for
 * years), so only bills that moved in the last `dias` days or sit on an
 * agenda are kept.
 */
export function emTramitacao(dias: number, tipos = TIPOS_PADRAO): Promise<ProposicaoTramitando[]> {
  const desde = addDays(today(), -dias);
  return cached(`senado:tramitando:${desde}:${tipos.join(",")}`, 2 * HOUR, async () => {
    const orgaos = [...(await comissoes()), PLENARIO];
    const porOrgao = await mapLimit(orgaos, 6, async (o) => {
      try {
        const lista = await cached(`senado:colegiado:${o.id}`, 3 * HOUR, () =>
          get<ProcLista[]>(`/processo?tramitando=S&codigoColegiadoTramitando=${o.id}`),
        );
        return asArray(lista).map((p) => ({ p, orgao: o.sigla }));
      } catch {
        return [];
      }
    });
    const out: ProposicaoTramitando[] = [];
    const seen = new Set<number>();
    for (const { p, orgao } of porOrgao.flat()) {
      const tipo = p.identificacao.split(" ")[0];
      if (!tipos.includes(tipo) || seen.has(p.id)) continue;
      const situacao = p.situacaoAtual ?? "";
      const cls = classificar("senado", orgao, situacao);
      const data = p.dataSituacaoAtual ?? p.dataUltimaAtualizacao?.slice(0, 10) ?? "";
      const relevante = data >= desde || cls.etapa === "em_pauta";
      if (!relevante || cls.fase === "concluida") continue;
      seen.add(p.id);
      out.push({
        id: String(p.id),
        casa: "senado",
        sigla: p.identificacao.replace(/ - .*$/, ""),
        tipo,
        ementa: p.ementa ?? "",
        orgao,
        situacao: situacao.charAt(0) + situacao.slice(1).toLowerCase(),
        dataSituacao: data,
        autoria: p.autoria,
        ...cls,
      });
    }
    return out;
  });
}

// ---------------------------------------------------------------- proposição

type ProcDet = {
  id: number;
  codigoMateria: number;
  identificacao: string;
  descricaoSigla?: string;
  conteudo?: { ementa?: string };
  documento?: { indexacao?: string; dataApresentacao?: string; url?: string };
  situacaoAtual?: string;
  dataSituacaoAtual?: string;
  autoriaIniciativa?: { autor: string }[];
  autuacoes: {
    siglaEnteControleAtual?: string;
    nomeEnteControleAtual?: string;
    situacoes?: { descricao: string; inicio: string; colegiado?: { sigla?: string } }[];
    informesLegislativos?: {
      data: string;
      descricao: string;
      colegiado?: { sigla?: string };
      enteAdministrativo?: { sigla?: string };
    }[];
  }[];
};

type Relatoria = {
  nomeParlamentar?: string;
  siglaPartidoParlamentar?: string;
  ufParlamentar?: string;
  siglaColegiado?: string;
  dataDesignacao?: string;
  dataDestituicao?: string | null;
  formaTratamentoParlamentar?: string;
};

async function resolverId(id: string): Promise<string | null> {
  if (!id.startsWith("m")) return id;
  const r = await get<{ id: number }[]>(`/processo?codigoMateria=${id.slice(1)}`);
  return asArray(r)[0] ? String(asArray(r)[0].id) : null;
}

export async function proposicao(idOrMateria: string): Promise<ProposicaoDetalhe | null> {
  const id = await cached(`senado:resolve:${idOrMateria}`, 30 * 24 * HOUR, () => resolverId(idOrMateria));
  if (!id) return null;
  const p = await cached(`senado:proc:${id}`, 6 * HOUR, () => get<ProcDet>(`/processo/${id}`));
  const [rel, vots] = await Promise.all([
    cached(`senado:relatoria:${id}`, 6 * HOUR, () => get<Relatoria[]>(`/processo/relatoria?idProcesso=${id}`)).catch(
      () => [] as Relatoria[],
    ),
    cached(`senado:propvot:${id}`, 6 * HOUR, () => get<VotacaoRaw[]>(`/votacao?idProcesso=${id}`)).catch(
      () => [] as VotacaoRaw[],
    ),
  ]);

  const aut = p.autuacoes[0];
  const sit = aut?.situacoes?.at(-1);
  const orgao = sit?.colegiado?.sigla || aut?.siglaEnteControleAtual || "";
  const situacao = p.situacaoAtual || sit?.descricao || "";
  const atual = asArray(rel)
    .filter((r) => !r.dataDestituicao)
    .sort((a, b) => ((a.dataDesignacao ?? "") < (b.dataDesignacao ?? "") ? 1 : -1))[0];

  const autores = p.autoriaIniciativa ?? [];
  return {
    id,
    casa: "senado",
    sigla: p.identificacao,
    tipo: p.descricaoSigla ?? p.identificacao.split(" ")[0],
    ementa: p.conteudo?.ementa ?? "",
    keywords: p.documento?.indexacao?.replace(/\s*,\s*/g, ", ").trim(),
    apresentacao: p.documento?.dataApresentacao,
    autoria: autores.length > 2 ? `${autores[0].autor} e outros` : autores.map((a) => a.autor).join(" e ") || undefined,
    orgao,
    situacao: situacao.charAt(0) + situacao.slice(1).toLowerCase(),
    relator: atual?.nomeParlamentar
      ? `${atual.nomeParlamentar} (${atual.siglaPartidoParlamentar}/${atual.ufParlamentar})${atual.siglaColegiado ? ` na ${atual.siglaColegiado}` : ""}`
      : undefined,
    urlTexto: p.documento?.url,
    urlOficial: `https://www25.senado.leg.br/web/atividade/materias/-/materia/${p.codigoMateria}`,
    ...classificar("senado", orgao, situacao),
    tramitacoes: (aut?.informesLegislativos ?? [])
      .map((i) => ({
        data: i.data.replace(" ", "T"),
        orgao: i.colegiado?.sigla || i.enteAdministrativo?.sigla || "",
        descricao: i.descricao.trim(),
      }))
      .sort((a, b) => (a.data < b.data ? 1 : -1)),
    votacoes: asArray(vots).map(resumo),
  };
}
