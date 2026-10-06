export type Casa = "camara" | "senado";

export const CASAS: Casa[] = ["camara", "senado"];

export const CASA_LABEL: Record<Casa, string> = {
  camara: "Câmara dos Deputados",
  senado: "Senado Federal",
};

export const CASA_CURTA: Record<Casa, string> = {
  camara: "Câmara",
  senado: "Senado",
};

export function isCasa(v: string): v is Casa {
  return v === "camara" || v === "senado";
}

export interface Parlamentar {
  id: string;
  nome: string;
  partido: string;
  uf: string;
  foto?: string;
  url?: string;
}

/** Normalised vote of one member. "ausente" covers absences, leaves and missions. */
export type TipoVoto =
  | "sim"
  | "nao"
  | "abstencao"
  | "obstrucao"
  | "presidente"
  | "votou" // secret ballot: only presence is known
  | "ausente";

export interface Voto {
  parlamentar: Parlamentar;
  voto: TipoVoto;
  /** Original label from the source, e.g. "P-NRV", "Artigo 17". */
  rotulo: string;
}

export interface Orientacao {
  bancada: string;
  orientacao: string;
  /** Expanded from a bloc orientation rather than published for the party itself. */
  derivada?: boolean;
}

export interface ProposicaoRef {
  id: string;
  sigla: string; // e.g. "PL 1234/2026"
  ementa: string;
}

export interface VotacaoResumo {
  id: string;
  casa: Casa;
  data: string; // ISO date-time
  orgao: string; // PLEN, CCJ...
  descricao: string;
  aprovada: boolean | null;
  nominal: boolean;
  placar?: { sim: number; nao: number; abstencao: number };
  proposicao?: ProposicaoRef;
}

export interface VotacaoDetalhe extends VotacaoResumo {
  secreta: boolean;
  votos: Voto[];
  orientacoes: Orientacao[];
  relato?: string;
}

export interface ItemPauta {
  titulo: string; // "PL 1234/2026"
  ementa?: string;
  proposicaoId?: string;
  relator?: string;
  situacao?: string;
}

export interface EventoAgenda {
  id: string;
  casa: Casa;
  inicio: string; // ISO
  titulo: string;
  orgao: string;
  orgaoNome?: string;
  situacao: string;
  deliberativo: boolean;
  local?: string;
  url?: string;
  pauta: ItemPauta[];
}

/** Coarse life-cycle stage of a bill across the legislative process. */
export type Fase =
  | "apresentacao"
  | "comissoes"
  | "plenario"
  | "outra_casa"
  | "sancao"
  | "concluida";

/** Finer stage inside a committee, used for the tramitação board columns. */
export type Etapa =
  | "aguardando_relator"
  | "em_analise"
  | "pronta_pauta"
  | "em_pauta"
  | "deliberada"
  | "outra";

export interface ProposicaoTramitando {
  id: string;
  casa: Casa;
  sigla: string;
  tipo: string;
  ementa: string;
  orgao: string; // where it is now
  situacao: string;
  dataSituacao: string;
  fase: Fase;
  etapa: Etapa;
  autoria?: string;
  regime?: string;
}

export interface Tramitacao {
  data: string;
  orgao: string;
  descricao: string;
  despacho?: string;
}

export interface ProposicaoDetalhe {
  id: string;
  casa: Casa;
  sigla: string;
  tipo: string;
  ementa: string;
  ementaDetalhada?: string;
  keywords?: string;
  apresentacao?: string;
  autoria?: string;
  orgao: string;
  situacao: string;
  fase: Fase;
  etapa: Etapa;
  regime?: string;
  relator?: string;
  urlTexto?: string;
  urlOficial: string;
  tramitacoes: Tramitacao[];
  votacoes: VotacaoResumo[];
}

export interface Comissao {
  id: string;
  sigla: string;
  nome: string;
}

// ---------------------------------------------------------------- perfis

export interface Perfil extends Parlamentar {
  casa: Casa;
  nomeCivil?: string;
  nascimento?: string; // YYYY-MM-DD
  naturalidade?: string; // "Macapá/AP"
  escolaridade?: string;
  formacao: string[];
  profissoes: string[];
  email?: string;
  telefone?: string;
  gabinete?: string;
  site?: string;
  redes: string[];
  situacao?: string; // "Exercício", "Titular"...
  mandato?: string; // "2023 a 2031"
  urlOficial: string;
}

export interface Vinculo {
  sigla: string;
  nome: string;
  papel?: string; // Titular, Suplente, Presidente...
  inicio?: string;
  fim?: string;
}

export interface Filiacao {
  partido: string;
  inicio: string;
  fim?: string;
}

export interface VotoHistorico {
  votacao: VotacaoResumo;
  voto: TipoVoto;
  rotulo: string;
  /** Orientation for the member's party, when published. */
  orientacao?: string;
}

export type ResultadoEmenda = "aprovada" | "rejeitada" | "prejudicada" | "retirada" | "parcial" | "pendente" | "desconhecido";

/** Amendment to a bill's text. */
export interface EmendaProjeto {
  id: string;
  casa: Casa;
  identificacao: string; // "EMENDA 107 - MPV 1376/2026" or "EMC 1/2024 CDC"
  autoria: string;
  data: string;
  colegiado?: string;
  emendado?: { id: string; sigla: string };
  resultado: ResultadoEmenda;
  resultadoTexto?: string;
  dataResultado?: string;
  ementa?: string;
  url?: string;
}

export type StatusOrcamento = "paga" | "paga_parcial" | "liquidada" | "empenhada" | "sem_execucao";

/** Budget amendment (Portal da Transparência). Values in BRL. */
export interface EmendaOrcamento {
  codigo: string;
  ano: number;
  tipo: string;
  autor: string;
  numero: string;
  localidade: string;
  funcao: string;
  subfuncao: string;
  empenhado: number;
  liquidado: number;
  pago: number;
  status: StatusOrcamento;
}

export interface GastoCategoria {
  categoria: string;
  total: number;
  n: number;
}

export interface Gastos {
  desde: string;
  total: number;
  porCategoria: GastoCategoria[];
  porMes: { mes: string; total: number }[];
  maioresFornecedores: { nome: string; total: number }[];
}

export interface Autoria {
  id: string;
  sigla: string;
  ementa: string;
  data: string;
  situacao?: string;
}
