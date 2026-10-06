import type { Casa, Etapa, Fase } from "./types";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const PLENARIOS = new Set(["PLEN", "PLENARIO", "PLEN-SF", "PLEN-CD", "PLEN-CN"]);

/**
 * Turn the free-text "situação" each house publishes into a coarse stage of
 * the legislative process and a finer committee step. Rules are ordered: the
 * first match wins.
 */
export function classificar(casa: Casa, orgao: string, situacao: string): { fase: Fase; etapa: Etapa } {
  const s = norm(situacao || "");
  const o = (orgao || "").toUpperCase();
  const outra = casa === "camara" ? "senado" : "camara";

  if (/transformad[oa] em norma|arquivad|retirad[oa] pel|prejudicad|rejeitad|devolvid[ao] ao autor|sem eficacia|vetad|perda de eficacia|perdeu a eficacia|declaracao de prejudicialidade|declarad[oa] prejudicad|enviad[oa] ao arquivo|promulgad|norma juridica/.test(s))
    return { fase: "concluida", etapa: "deliberada" };

  if (/sancao|remetid[oa] a sancao|aguardando sancao/.test(s)) return { fase: "sancao", etapa: "deliberada" };

  if (
    /apreciacao pelo senado|remetid[oa] ao senado|enviad[oa] ao senado|remetid[oa] a camara|enviad[oa] a camara|aguardando apreciacao pela camara|revisao da camara|revisao do senado/.test(s) ||
    (outra === "senado" && /senado federal/.test(s) && /aguardando/.test(s))
  )
    return { fase: "outra_casa", etapa: "deliberada" };

  const noPlenario = PLENARIOS.has(o) || /plenario/.test(s);

  let etapa: Etapa = "outra";
  if (/designacao d[eo] relator|aguardando relator|distribuid|aguardando constituicao|aguardando criacao|aguardando despacho/.test(s)) etapa = "aguardando_relator";
  else if (/incluida na pauta|em pauta|pauta da reuniao|pauta da sessao|em votacao|incluida em ordem do dia|na ordem do dia|pedido de vista|vista concedid|aguardando reinicio/.test(s)) etapa = "em_pauta";
  else if (/pronta? para (a )?pauta|pronto para deliberacao|pronta para deliberacao|aguardando inclusao|aguardando deliberacao|pronta para a ordem do dia|aguardando votacao/.test(s)) etapa = "pronta_pauta";
  else if (/relatoria|parecer d[oa] relator|aguardando parecer|com relator|audiencia publica|aguardando emendas|prazo para emendas|recebimento de emendas|aguardando apresentacao de emendas|aguardando vistas|em analise|aguardando devolucao/.test(s)) etapa = "em_analise";
  else if (/aprovad[oa]|parecer aprovado|aprovado parecer|aprovad[oa] o parecer|votad[oa]/.test(s)) etapa = "deliberada";

  if (noPlenario) return { fase: "plenario", etapa };

  if (o === "MESA" || o === "SGM" || o === "SEADI" || o === "SLSF" || /recebimento(?! de emendas)|aguardando leitura|aguardando encaminhamento|aguardando autorizacao|despacho do presidente/.test(s) || !s)
    return { fase: "apresentacao", etapa: etapa === "outra" ? "aguardando_relator" : etapa };

  return { fase: "comissoes", etapa };
}

export const FASES: { id: Fase; label: string }[] = [
  { id: "apresentacao", label: "Apresentação" },
  { id: "comissoes", label: "Comissões" },
  { id: "plenario", label: "Plenário" },
  { id: "outra_casa", label: "Outra Casa" },
  { id: "sancao", label: "Sanção" },
  { id: "concluida", label: "Concluída" },
];

export const FASE_LABEL = Object.fromEntries(FASES.map((f) => [f.id, f.label])) as Record<Fase, string>;

export const ETAPAS: { id: Etapa; label: string; hint: string }[] = [
  { id: "aguardando_relator", label: "Aguardando relator", hint: "Distribuída, ainda sem relator designado" },
  { id: "em_analise", label: "Em análise", hint: "Com relator, parecer em elaboração" },
  { id: "pronta_pauta", label: "Pronta para pauta", hint: "Parecer pronto, aguardando ser pautada" },
  { id: "em_pauta", label: "Em pauta", hint: "Incluída na pauta de uma reunião ou sessão" },
  { id: "deliberada", label: "Deliberada", hint: "Votada no órgão, seguindo adiante" },
  { id: "outra", label: "Outras situações", hint: "Situação que não se encaixa nas etapas acima" },
];

export const ETAPA_LABEL = Object.fromEntries(ETAPAS.map((e) => [e.id, e.label])) as Record<Etapa, string>;
