import { cached, HOUR, MIN, mapLimit } from "./cache";
import { addDays, today } from "./dates";
import { classificar } from "./fase";
import { getJson, UpstreamError } from "./http";
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

const BASE = "https://dadosabertos.camara.leg.br/api/v2";

export type Page<T> = { dados: T; links?: { rel: string; href: string }[] };

export async function get<T>(path: string): Promise<T> {
  const r = await getJson<Page<T>>(path.startsWith("http") ? path : `${BASE}${path}`);
  return r.dados;
}

/** Follow `next` links until exhausted (or `max` pages). */
export async function getAll<T>(path: string, max = 20): Promise<T[]> {
  const out: T[] = [];
  let url: string | undefined = `${BASE}${path}`;
  for (let i = 0; url && i < max; i++) {
    const page: Page<T[]> = await getJson<Page<T[]>>(url);
    out.push(...page.dados);
    url = page.links?.find((l) => l.rel === "next")?.href;
  }
  return out;
}

// ---------------------------------------------------------------- deputados

type DepRaw = { id: number; nome: string; siglaPartido: string; siglaUf: string; urlFoto?: string };

function dep(d: DepRaw): Parlamentar {
  return {
    id: String(d.id),
    nome: d.nome,
    partido: normalizarPartido(d.siglaPartido),
    uf: d.siglaUf,
    foto: d.urlFoto,
    url: `https://www.camara.leg.br/deputados/${d.id}`,
  };
}

export function deputados(): Promise<Parlamentar[]> {
  return cached("camara:deputados", 12 * HOUR, async () => {
    const all = await getAll<DepRaw>("/deputados?itens=1000&ordem=ASC&ordenarPor=nome");
    return all.map(dep);
  });
}

// ---------------------------------------------------------------- votações

type VotRaw = {
  id: string;
  data: string;
  dataHoraRegistro: string;
  siglaOrgao: string;
  descricao: string;
  aprovacao: number | null;
  proposicaoObjeto?: string | null;
};

type VotDetRaw = VotRaw & {
  idEvento?: number;
  descUltimaAberturaVotacao?: string;
  proposicoesAfetadas?: PropRefRaw[];
  objetosPossiveis?: PropRefRaw[];
  ultimaApresentacaoProposicao?: { descricao?: string };
};

type PropRefRaw = { id: number; siglaTipo: string; numero: number; ano: number; ementa: string };

const MAIN_TYPES = new Set(["PL", "PLP", "PEC", "MPV", "PDL", "PLV", "PRC", "PLN", "PDC"]);

function placarFrom(desc: string) {
  const m = /Sim:\s*(\d+)\s*;\s*N[ãa]o:\s*(\d+)(?:\s*;\s*Absten[çc][ãa]o:\s*(\d+))?/i.exec(desc);
  if (!m) return undefined;
  return { sim: +m[1], nao: +m[2], abstencao: m[3] ? +m[3] : 0 };
}

function pickProposicao(d: VotDetRaw) {
  const list = [...(d.proposicoesAfetadas ?? []), ...(d.objetosPossiveis ?? [])];
  const main = list.find((p) => MAIN_TYPES.has(p.siglaTipo) && p.ano > 0) ?? list.find((p) => p.ano > 0);
  if (!main) return undefined;
  return { id: String(main.id), sigla: `${main.siglaTipo} ${main.numero}/${main.ano}`, ementa: main.ementa };
}

function resumo(v: VotRaw, extra?: VotDetRaw): VotacaoResumo {
  const placar = placarFrom(v.descricao);
  return {
    id: v.id,
    casa: "camara",
    data: v.dataHoraRegistro || v.data,
    orgao: v.siglaOrgao,
    descricao: v.descricao.trim(),
    aprovada: v.aprovacao == null ? null : v.aprovacao === 1,
    nominal: !!placar,
    placar,
    proposicao: extra ? pickProposicao(extra) : undefined,
  };
}

function votacaoRaw(id: string) {
  // Past votes never change; cache them for a long time.
  return cached(`camara:votacao:${id}`, 7 * 24 * HOUR, () => get<VotDetRaw>(`/votacoes/${encodeURIComponent(id)}`));
}

export function votacoes(de: string, ate: string, { soPlenario = false } = {}): Promise<VotacaoResumo[]> {
  const ttl = ate >= addDays(today(), -1) ? 15 * MIN : 24 * HOUR;
  return cached(`camara:votacoes:${de}:${ate}:${soPlenario}`, ttl, async () => {
    const orgao = soPlenario ? "&idOrgao=180" : "";
    const raw = await getAll<VotRaw>(
      `/votacoes?dataInicio=${de}&dataFim=${ate}&itens=200&ordem=DESC&ordenarPor=dataHoraRegistro${orgao}`,
    );
    // Enrich nominal and plenary votes with their proposition (one call each, cached).
    return mapLimit(raw, 8, async (v) => {
      const worth = v.siglaOrgao === "PLEN" || placarFrom(v.descricao);
      if (!worth) return resumo(v);
      try {
        return resumo(v, await votacaoRaw(v.id));
      } catch {
        return resumo(v);
      }
    });
  });
}

function tipoVoto(t: string): TipoVoto {
  const s = t.toLowerCase();
  if (s === "sim") return "sim";
  if (s === "não" || s === "nao") return "nao";
  if (s.startsWith("absten")) return "abstencao";
  if (s.startsWith("obstru")) return "obstrucao";
  if (s.includes("artigo 17")) return "presidente";
  return "ausente";
}

const semAcento = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Current blocs, e.g. "UNIÃO, PP, PSD, REPUBLICANOS, MDB, Federação PSDB CIDADANIA, PODE". */
function blocos() {
  return cached("camara:blocos", 24 * HOUR, async () => {
    const r = await get<{ id: string; nome: string }[]>("/blocos?idLegislatura=57&itens=100");
    return r.map((b) => {
      const itens = b.nome.split(",").map((x) => x.trim());
      const partidos = itens.flatMap((x) =>
        /^Federa/i.test(x) ? x.replace(/^Federa\S*\s*/i, "").split(/\s+/) : [x],
      );
      // Orientation labels abbreviate blocs as "Bl " + first 3 letters of each member: "Bl UniPpPsd...".
      const sigla = semAcento(itens.map((x) => x.split(/\s+/)[0].slice(0, 3)).join(""));
      return { sigla, partidos: partidos.map(normalizarPartido) };
    });
  });
}

/** Expand "Bl UniPpPsd..." orientations into one entry per member party. */
async function expandirBlocos(orient: Orientacao[]): Promise<Orientacao[]> {
  const comBloco = orient.filter((o) => /^Bl /.test(o.bancada));
  if (!comBloco.length) return orient;
  const bs = await blocos().catch(() => []);
  const extra = comBloco.flatMap((o) => {
    const abrev = semAcento(o.bancada.replace(/^Bl\s+/, "").replace(/\.+$/, ""));
    // The label is a truncated prefix of the bloc's abbreviation; prefer the largest matching bloc.
    const b = bs
      .filter((x) => x.partidos.length > 1 && x.sigla.startsWith(abrev))
      .sort((p, q) => q.partidos.length - p.partidos.length)[0];
    return b ? b.partidos.map((p) => ({ bancada: p, orientacao: o.orientacao, derivada: true })) : [];
  });
  return [...orient, ...extra];
}

export async function votacao(id: string): Promise<VotacaoDetalhe> {
  const [d, votosRaw, orient, roster] = await Promise.all([
    votacaoRaw(id),
    cached(`camara:votos:${id}`, 7 * 24 * HOUR, () =>
      get<{ tipoVoto: string; deputado_: DepRaw }[]>(`/votacoes/${encodeURIComponent(id)}/votos`),
    ),
    cached(`camara:orient:${id}`, 7 * 24 * HOUR, () =>
      get<{ orientacaoVoto: string; siglaPartidoBloco: string }[]>(`/votacoes/${encodeURIComponent(id)}/orientacoes`),
    ),
    deputados(),
  ]);

  const votos: Voto[] = votosRaw.map((v) => ({
    parlamentar: dep(v.deputado_),
    voto: tipoVoto(v.tipoVoto),
    rotulo: v.tipoVoto,
  }));
  // Members not listed did not vote: show them as absent so the hemicycle is complete.
  if (votos.length) {
    const seen = new Set(votos.map((v) => v.parlamentar.id));
    for (const p of roster) if (!seen.has(p.id)) votos.push({ parlamentar: p, voto: "ausente", rotulo: "Não votou" });
  }

  const base = resumo(d, d);
  if (votosRaw.length) {
    const c = (t: TipoVoto) => votos.filter((v) => v.voto === t).length;
    base.placar = { sim: c("sim"), nao: c("nao"), abstencao: c("abstencao") };
    base.nominal = true;
  }
  return {
    ...base,
    secreta: false,
    votos,
    orientacoes: await expandirBlocos(
      orient
        .filter((o) => o.orientacaoVoto)
        .map((o) => ({ bancada: o.siglaPartidoBloco, orientacao: o.orientacaoVoto })),
    ),
    relato: d.ultimaApresentacaoProposicao?.descricao?.trim(),
  };
}

// ---------------------------------------------------------------- agenda

type EventoRaw = {
  id: number;
  dataHoraInicio: string;
  situacao: string;
  descricaoTipo: string;
  descricao: string;
  orgaos: { sigla: string; nome: string }[];
  localCamara?: { nome?: string };
};

type PautaRaw = {
  titulo: string;
  situacaoItem?: string;
  relator?: { nome?: string; siglaPartido?: string; siglaUf?: string } | null;
  proposicao_?: PropRefRaw;
  proposicaoRelacionada_?: PropRefRaw | null;
};

export function agenda(de: string, ate: string): Promise<EventoAgenda[]> {
  const ttl = ate >= today() ? 20 * MIN : 24 * HOUR;
  return cached(`camara:agenda:${de}:${ate}`, ttl, async () => {
    const todos = await getAll<EventoRaw>(`/eventos?dataInicio=${de}&dataFim=${ate}&itens=200&ordem=ASC&ordenarPor=dataHoraInicio`);
    // The Câmara publishes internal test events on its open calendar.
    const evs = todos.filter((e) => !e.orgaos.some((o) => /TESTE/i.test(o.sigla)));
    return mapLimit(evs, 6, async (e): Promise<EventoAgenda> => {
      const deliberativo = /deliberativa/i.test(e.descricaoTipo);
      let pauta: ItemPauta[] = [];
      if (deliberativo && !/cancelad/i.test(e.situacao)) {
        try {
          const raw = await get<PautaRaw[]>(`/eventos/${e.id}/pauta`);
          pauta = raw.map((p) => {
            const prop = p.proposicaoRelacionada_ ?? p.proposicao_;
            return {
              titulo: p.titulo,
              ementa: prop?.ementa,
              proposicaoId: prop ? String(prop.id) : undefined,
              relator: p.relator?.nome
                ? `${p.relator.nome} (${p.relator.siglaPartido}/${p.relator.siglaUf})`
                : undefined,
              situacao: p.situacaoItem?.trim() || undefined,
            };
          });
        } catch {
          // Agenda still useful without the item list.
        }
      }
      const org = e.orgaos[0];
      return {
        id: `c${e.id}`,
        casa: "camara",
        inicio: e.dataHoraInicio,
        titulo: e.descricao.trim() || e.descricaoTipo,
        orgao: org?.sigla ?? "",
        orgaoNome: org?.nome,
        situacao: e.situacao,
        deliberativo,
        local: e.localCamara?.nome ?? undefined,
        url: `https://www.camara.leg.br/evento-legislativo/${e.id}`,
        pauta,
      };
    });
  });
}

// ---------------------------------------------------------------- proposições

type StatusRaw = {
  dataHora: string;
  sequencia?: number;
  siglaOrgao: string;
  descricaoSituacao: string | null;
  descricaoTramitacao: string;
  despacho: string;
  regime: string;
  uriUltimoRelator?: string | null;
};

type PropRaw = PropRefRaw & {
  descricaoTipo: string;
  ementaDetalhada?: string;
  keywords?: string;
  dataApresentacao: string;
  urlInteiroTeor?: string;
  statusProposicao: StatusRaw;
};

function propRaw(id: string) {
  return cached(`camara:prop:${id}`, 6 * HOUR, () => get<PropRaw>(`/proposicoes/${id}`));
}

function situacaoTexto(s: StatusRaw) {
  return s.descricaoSituacao || s.descricaoTramitacao || "";
}

function tramitando(p: PropRaw): ProposicaoTramitando {
  const s = p.statusProposicao;
  const situacao = situacaoTexto(s);
  return {
    id: String(p.id),
    casa: "camara",
    sigla: `${p.siglaTipo} ${p.numero}/${p.ano}`,
    tipo: p.siglaTipo,
    ementa: p.ementa,
    orgao: s.siglaOrgao,
    situacao,
    dataSituacao: s.dataHora,
    regime: s.regime,
    ...classificar("camara", s.siglaOrgao, situacao),
  };
}

export const TIPOS_PADRAO = ["PL", "PLP", "PEC", "MPV", "PDL"];

/**
 * Bills of the main types that moved in the last `dias` days, with their
 * current committee and situation. The list endpoint carries no status, so
 * each bill is looked up (cached for hours).
 */
export function emTramitacao(dias: number, tipos = TIPOS_PADRAO): Promise<ProposicaoTramitando[]> {
  const ate = today();
  const de = addDays(ate, -dias);
  return cached(`camara:tramitando:${de}:${tipos.join(",")}`, 2 * HOUR, async () => {
    const lista = await getAll<PropRefRaw>(
      `/proposicoes?siglaTipo=${tipos.join(",")}&dataInicio=${de}&dataFim=${ate}&itens=100&ordem=DESC&ordenarPor=id`,
      15,
    );
    const det = await mapLimit(lista, 12, async (p) => {
      try {
        return tramitando(await propRaw(String(p.id)));
      } catch {
        return null;
      }
    });
    return det.filter((x): x is ProposicaoTramitando => !!x && x.fase !== "concluida");
  });
}

export async function proposicao(id: string): Promise<ProposicaoDetalhe> {
  const [p, tram, vots] = await Promise.all([
    propRaw(id),
    cached(`camara:tram:${id}`, 6 * HOUR, () =>
      get<StatusRaw[]>(`/proposicoes/${id}/tramitacoes`),
    ),
    cached(`camara:propvot:${id}`, 6 * HOUR, () => get<VotRaw[]>(`/proposicoes/${id}/votacoes?ordem=DESC`)).catch(
      () => [] as VotRaw[],
    ),
  ]);
  const s = p.statusProposicao;
  let relator: string | undefined;
  if (s.uriUltimoRelator) {
    try {
      const r = await cached(`camara:dep:${s.uriUltimoRelator}`, 24 * HOUR, () =>
        get<{ ultimoStatus: { nome: string; siglaPartido: string; siglaUf: string } }>(s.uriUltimoRelator!),
      );
      relator = `${r.ultimoStatus.nome} (${r.ultimoStatus.siglaPartido}/${r.ultimoStatus.siglaUf})`;
    } catch {}
  }
  const situacao = situacaoTexto(s);
  return {
    id: String(p.id),
    casa: "camara",
    sigla: `${p.siglaTipo} ${p.numero}/${p.ano}`,
    tipo: p.descricaoTipo,
    ementa: p.ementa,
    ementaDetalhada: p.ementaDetalhada || undefined,
    keywords: p.keywords || undefined,
    apresentacao: p.dataApresentacao,
    orgao: s.siglaOrgao,
    situacao,
    regime: s.regime,
    relator,
    urlTexto: p.urlInteiroTeor || undefined,
    urlOficial: `https://www.camara.leg.br/propostas-legislativas/${p.id}`,
    ...classificar("camara", s.siglaOrgao, situacao),
    tramitacoes: [...tram]
      .sort((a, b) => (b.sequencia ?? 0) - (a.sequencia ?? 0) || b.dataHora.localeCompare(a.dataHora))
      .map((t) => ({ data: t.dataHora, orgao: t.siglaOrgao, descricao: t.descricaoTramitacao, despacho: t.despacho })),
    votacoes: vots.map((v) => resumo(v)),
  };
}

export async function autores(id: string): Promise<string | undefined> {
  try {
    const a = await cached(`camara:autores:${id}`, 24 * HOUR, () => get<{ nome: string }[]>(`/proposicoes/${id}/autores`));
    if (!a.length) return undefined;
    return a.length > 2 ? `${a[0].nome} e outros ${a.length - 1}` : a.map((x) => x.nome).join(" e ");
  } catch (e) {
    if (e instanceof UpstreamError) return undefined;
    throw e;
  }
}

export function comissoes(): Promise<Comissao[]> {
  return cached("camara:comissoes", 24 * HOUR, async () => {
    const r = await get<{ id: number; sigla: string; nome: string; apelido?: string }[]>(
      "/orgaos?codTipoOrgao=2&itens=100",
    );
    return r.map((o) => ({ id: String(o.id), sigla: o.sigla, nome: o.apelido || o.nome }));
  });
}
