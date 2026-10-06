import { cached, HOUR, mapLimit } from "./cache";
import { get, getAll, votacao, votacoes } from "./camara";
import { addDays, today } from "./dates";
import { agregarGastos, type LinhaGasto } from "./gastos";
import { getJson } from "./http";
import { normalizarPartido } from "./partidos";
import type { Autoria, EmendaProjeto, Filiacao, Gastos, Perfil, TipoVoto, VotacaoResumo, Vinculo, VotoHistorico } from "./types";
import { orientacaoDoPartido } from "./votos";

const BASE = "https://dadosabertos.camara.leg.br/api/v2";
const INICIO_LEGISLATURA = "2023-02-01";

type DepDetalhe = {
  id: number;
  nomeCivil: string;
  urlWebsite?: string | null;
  redeSocial?: string[];
  dataNascimento?: string;
  ufNascimento?: string;
  municipioNascimento?: string;
  escolaridade?: string;
  ultimoStatus: {
    nome: string;
    nomeEleitoral?: string;
    siglaPartido: string;
    siglaUf: string;
    urlFoto?: string;
    email?: string;
    situacao?: string;
    condicaoEleitoral?: string;
    gabinete?: { sala?: string; predio?: string; telefone?: string; email?: string };
  };
};

export async function perfil(id: string): Promise<Perfil> {
  const [d, prof] = await Promise.all([
    cached(`camara:perfil:${id}`, 12 * HOUR, () => get<DepDetalhe>(`/deputados/${id}`)),
    cached(`camara:profissoes:${id}`, 24 * HOUR, () => get<{ titulo: string | null }[]>(`/deputados/${id}/profissoes`)).catch(
      () => [],
    ),
  ]);
  const s = d.ultimoStatus;
  const g = s.gabinete;
  return {
    id: String(d.id),
    casa: "camara",
    nome: s.nomeEleitoral || s.nome,
    nomeCivil: d.nomeCivil,
    partido: normalizarPartido(s.siglaPartido),
    uf: s.siglaUf,
    foto: s.urlFoto,
    url: `https://www.camara.leg.br/deputados/${d.id}`,
    urlOficial: `https://www.camara.leg.br/deputados/${d.id}`,
    nascimento: d.dataNascimento,
    naturalidade: d.municipioNascimento ? `${d.municipioNascimento}/${d.ufNascimento}` : undefined,
    escolaridade: d.escolaridade || undefined,
    formacao: [],
    profissoes: prof.map((p) => p.titulo).filter((t): t is string => !!t),
    email: g?.email || s.email,
    telefone: g?.telefone ? `(61) ${g.telefone}` : undefined,
    gabinete: g?.sala ? `Gabinete ${g.sala}, anexo ${g.predio}` : undefined,
    site: d.urlWebsite || undefined,
    redes: d.redeSocial ?? [],
    situacao: [s.situacao, s.condicaoEleitoral].filter(Boolean).join(", "),
    mandato: "2023 a 2027",
  };
}

export function vinculos(id: string): Promise<{ comissoes: Vinculo[]; frentes: Vinculo[]; filiacoes: Filiacao[] }> {
  return cached(`camara:vinculos:${id}`, 12 * HOUR, async () => {
    const [orgs, frentes] = await Promise.all([
      get<{ siglaOrgao: string; nomeOrgao: string; nomePublicacao?: string; titulo: string; dataInicio: string; dataFim: string | null }[]>(
        `/deputados/${id}/orgaos?dataInicio=${INICIO_LEGISLATURA}&itens=100&ordem=DESC&ordenarPor=dataInicio`,
      ).catch(() => []),
      get<{ titulo: string; idLegislatura: number }[]>(`/deputados/${id}/frentes`)
        .then((fs) => fs.filter((f) => f.idLegislatura === 57))
        .catch(() => []),
    ]);
    return {
      comissoes: orgs.map((o) => ({
        sigla: o.siglaOrgao,
        nome: o.nomePublicacao || o.nomeOrgao,
        papel: o.titulo,
        inicio: o.dataInicio?.slice(0, 10),
        fim: o.dataFim?.slice(0, 10) ?? undefined,
      })),
      frentes: frentes.map((f) => ({ sigla: "", nome: f.titulo.replace(/\s*-\s*[A-Z][\w-]*\.?$/, "").replace(/\.$/, "") })),
      filiacoes: [],
    };
  });
}

type PropLista = { id: number; siglaTipo: string; numero: number; ano: number; ementa: string; dataApresentacao?: string };

export function autoria(id: string): Promise<Autoria[]> {
  return cached(`camara:autoria:${id}`, 12 * HOUR, async () => {
    const r = await getAll<PropLista>(
      `/proposicoes?idDeputadoAutor=${id}&siglaTipo=PL,PLP,PEC,PDL,PRC&dataApresentacaoInicio=${INICIO_LEGISLATURA}&ordem=DESC&ordenarPor=id&itens=100`,
      4,
    );
    return r.map((p) => ({
      id: String(p.id),
      sigla: `${p.siglaTipo} ${p.numero}/${p.ano}`,
      ementa: p.ementa,
      data: p.dataApresentacao ?? "",
    }));
  });
}

const TIPOS_EMENDA = "EMC,EMP,EMA,ESB,EMR,EMS,EMD,SBE,EMRP,EMPV";

/**
 * Amendments to bills filed by a deputy. The Câmara API does not link an
 * amendment to the bill it amends nor publish its outcome, so `resultado`
 * is always "desconhecido".
 */
export function emendasProjeto(id: string): Promise<EmendaProjeto[]> {
  return cached(`camara:emendasprojeto:${id}`, 12 * HOUR, async () => {
    const r = await getAll<PropLista>(
      `/proposicoes?idDeputadoAutor=${id}&siglaTipo=${TIPOS_EMENDA}&dataApresentacaoInicio=${INICIO_LEGISLATURA}&ordem=DESC&ordenarPor=id&itens=100`,
      4,
    );
    return r.map((e) => ({
      id: String(e.id),
      casa: "camara" as const,
      identificacao: `${e.siglaTipo} ${e.numero}${e.ano ? `/${e.ano}` : ""}`,
      autoria: "",
      data: e.dataApresentacao ?? "",
      resultado: "desconhecido" as const,
      ementa: e.ementa,
      url: `https://www.camara.leg.br/propostas-legislativas/${e.id}`,
    }));
  });
}

type DespesaRaw = {
  ano: number;
  mes: number;
  tipoDespesa: string;
  dataDocumento: string | null;
  valorLiquido: number;
  valorDocumento: number;
  nomeFornecedor: string;
};

/**
 * Parliamentary quota spending in the last 12 months. The API's `ano`
 * filter currently returns nothing, so pages are read newest first across
 * the whole legislature until they pass the cut-off date.
 */
export function gastos(id: string): Promise<Gastos> {
  const desde = `${addDays(today(), -365).slice(0, 7)}-01`;
  return cached(`camara:gastos:${id}:${desde}`, 12 * HOUR, async () => {
    const linhas: LinhaGasto[] = [];
    let url: string | undefined =
      `${BASE}/deputados/${id}/despesas?idLegislatura=57&itens=100&ordem=DESC&ordenarPor=dataDocumento`;
    for (let i = 0; url && i < 25; i++) {
      const page: { dados: DespesaRaw[]; links?: { rel: string; href: string }[] } = await getJson(url);
      for (const d of page.dados) {
        const data = d.dataDocumento?.slice(0, 10) ?? `${d.ano}-${String(d.mes).padStart(2, "0")}-01`;
        linhas.push({
          data,
          categoria: d.tipoDespesa,
          fornecedor: d.nomeFornecedor,
          valor: d.valorLiquido ?? d.valorDocumento ?? 0,
        });
      }
      const ultima = page.dados.at(-1);
      if (!ultima || `${ultima.ano}-${String(ultima.mes).padStart(2, "0")}` < desde.slice(0, 7)) break;
      url = page.links?.find((l) => l.rel === "next")?.href;
    }
    return agregarGastos(linhas, desde);
  });
}

type Entrada = { voto: TipoVoto; rotulo: string; orientacao?: string };

/**
 * Index of every nominal vote in the window: vote summary plus, per deputy,
 * how they voted and what their party oriented. Shared by all profiles.
 */
function indiceVotos(dias: number) {
  const ate = today();
  const de = addDays(ate, -dias);
  return cached(
    `camara:indicevotos:${de}`,
    HOUR,
    async () => {
      const nominais = (await votacoes(de, ate)).filter((v) => v.nominal);
      const detalhes = await mapLimit(nominais, 6, async (v) => {
        try {
          return await votacao(v.id);
        } catch {
          return null;
        }
      });
      const resumos: VotacaoResumo[] = [];
      const porDeputado: Record<string, Record<string, Entrada>> = {};
      for (const d of detalhes) {
        if (!d) continue;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { votos, orientacoes, relato, secreta, ...res } = d;
        resumos.push(res);
        for (const x of votos) {
          const o = orientacaoDoPartido(x.parlamentar.partido, orientacoes);
          (porDeputado[x.parlamentar.id] ??= {})[d.id] = { voto: x.voto, rotulo: x.rotulo, orientacao: o?.orientacao };
        }
      }
      return { resumos, porDeputado };
    },
    { persist: true },
  );
}

export async function historicoVotos(id: string, dias = 120): Promise<VotoHistorico[]> {
  const { resumos, porDeputado } = await indiceVotos(dias);
  const meus = porDeputado[id] ?? {};
  return resumos
    .filter((r) => meus[r.id])
    .map((r) => ({ votacao: r, ...meus[r.id] }))
    .sort((a, b) => b.votacao.data.localeCompare(a.votacao.data));
}
