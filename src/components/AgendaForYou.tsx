"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDayLong } from "@/lib/dates";
import type { Casa } from "@/lib/types";

interface RankedItem {
  key: string;
  titulo: string;
  ementa?: string;
  proposicaoId?: string;
  inicio: string;
  orgao: string;
}

/** What the list is ordered by: the reader's profile, or a topic they typed. */
type Basis = { tema?: string };

type State =
  | { tipo: "inativo" }
  | ({ tipo: "carregando" } & Basis)
  | ({ tipo: "ok"; itens: RankedItem[] } & Basis)
  | ({ tipo: "erro"; msg: string } & Basis);

const MAX_TEMA = 300;

async function fetchRanking(casa: Casa, tema?: string): Promise<State> {
  try {
    const r = await fetch(`/api/pauta/${casa}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tema }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro ?? "Falha ao ordenar a pauta.");
    return { tipo: "ok", itens: j.itens as RankedItem[], tema };
  } catch (e) {
    return { tipo: "erro", msg: e instanceof Error ? e.message : "Falha ao ordenar a pauta.", tema };
  }
}

function Unavailable({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line p-4 text-[13px] text-ink-2">
      <p className="font-medium text-ink">Pauta para você</p>
      <p className="mt-1">{children}</p>
    </div>
  );
}

const ToSettings = () => (
  <Link href="/configuracoes" className="text-phosphor hover:underline">
    Configurações
  </Link>
);

/**
 * The upcoming items most related to "Sobre você", or to a topic the reader types, ordered by an
 * embedding model in the AI service. Runs only when the reader asks: the first time it keeps the CPU
 * busy for up to a minute, after that each bill is cached and any new ranking takes under a second.
 */
export function AgendaForYou({
  casa,
  hasProfile,
  model,
}: {
  casa: Casa;
  hasProfile: boolean;
  /** null when the AI service is down. */
  model: { model: string; available: boolean; reason: string | null } | null;
}) {
  const [state, setState] = useState<State>({ tipo: "inativo" });
  const [tema, setTema] = useState("");

  if (!model) return <Unavailable>O serviço de IA não está rodando, então a pauta não pode ser ordenada para você.</Unavailable>;
  if (!model.available) {
    return (
      <Unavailable>
        {model.reason} Veja <ToSettings />.
      </Unavailable>
    );
  }

  const rank = (porTema?: string) => {
    setState({ tipo: "carregando", tema: porTema });
    void fetchRanking(casa, porTema).then(setState);
  };
  const ocupado = state.tipo === "carregando";
  const base = state.tipo !== "inativo" && state.tema;

  return (
    <section className="rounded-lg border border-phosphor/25 bg-phosphor/[0.04] p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-display text-[15px] font-semibold text-phosphor">Para você</h2>
        <span className="text-[12px] text-muted">
          {base ? (
            <>os itens da pauta mais ligados a &ldquo;{base}&rdquo;</>
          ) : (
            <>os itens da pauta mais ligados ao seu &ldquo;Sobre você&rdquo; ou a um tema que você escolher</>
          )}
          , ordenados por um modelo de IA neste computador
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {hasProfile && (
          <button
            type="button"
            onClick={() => rank()}
            disabled={ocupado}
            className="rounded-md bg-phosphor px-4 py-2 text-[13px] font-semibold text-bg hover:brightness-110 disabled:opacity-50"
          >
            Ordenar pelo meu perfil
          </button>
        )}
        <form
          className="flex min-w-[260px] flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (tema.trim()) rank(tema.trim());
          }}
        >
          <label htmlFor={`tema-${casa}`} className="sr-only">
            Tema
          </label>
          <input
            id={`tema-${casa}`}
            value={tema}
            onChange={(e) => setTema(e.target.value)}
            maxLength={MAX_TEMA}
            placeholder={hasProfile ? "ou por um tema: saúde, planos de saúde e SUS…" : "Ordenar por um tema: saúde, educação…"}
            disabled={ocupado}
            className="min-w-0 flex-1 rounded-md border border-line bg-bg px-3 py-2 text-[13px] text-ink placeholder:text-muted disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={ocupado || !tema.trim()}
            className="rounded-md border border-line px-3 py-2 text-[13px] text-ink hover:border-line-strong disabled:opacity-50"
          >
            Buscar
          </button>
        </form>
      </div>

      {state.tipo === "inativo" && (
        <p className="mt-2 max-w-[75ch] text-[12px] text-muted">
          Na primeira vez o computador lê cada item da pauta, o que pode levar até um minuto e ocupar o processador.
          Depois fica guardado, e qualquer nova ordenação é quase instantânea.
          {!hasProfile && (
            <>
              {" "}
              Para ordenar pelo seu perfil, preencha &ldquo;Sobre você&rdquo; em <ToSettings />.
            </>
          )}
        </p>
      )}

      {state.tipo === "carregando" && (
        <div role="status" className="mt-3 space-y-2">
          <p className="text-[13px] text-ink-2">Lendo a pauta para você…</p>
          <div className="relative h-3 w-4/5 overflow-hidden rounded bg-line">
            <span className="scanline absolute inset-y-0 left-0 w-1/3 bg-phosphor/30" />
          </div>
          <div className="h-3 w-3/5 rounded bg-line" />
        </div>
      )}

      {state.tipo === "erro" && (
        <p className="mt-3 text-[13px] text-ink-2">
          {state.msg}{" "}
          <button type="button" onClick={() => rank(state.tema)} className="text-phosphor hover:underline">
            Tentar de novo
          </button>
        </p>
      )}

      {state.tipo === "ok" && state.itens.length === 0 && (
        <p className="mt-3 text-[13px] text-ink-2">Nenhum item da pauta tem ementa publicada para comparar.</p>
      )}

      {state.tipo === "ok" && state.itens.length > 0 && (
        <>
          <ol className="mt-2 divide-y divide-line">
            {state.itens.map((it, n) => {
              const inner = (
                <>
                  <span className="tnum w-6 shrink-0 text-[12px] text-muted">{n + 1}</span>
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{it.titulo}</span>
                    {it.ementa && <span className="mt-0.5 line-clamp-2 text-[13px] text-ink-2">{it.ementa}</span>}
                    <span className="mt-0.5 block text-[12px] text-muted first-letter:uppercase">
                      {formatDayLong(it.inicio)} · {it.orgao}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={it.key}>
                  {it.proposicaoId ? (
                    <Link href={`/${casa}/proposicoes/${it.proposicaoId}`} className="flex gap-3 py-2.5 text-[14px] hover:bg-panel-2">
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex gap-3 py-2.5 text-[14px]">{inner}</div>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-[12px] text-muted">
            A ordem vem da semelhança entre o texto {state.tema ? "do tema" : "do seu perfil"} e o de cada ementa. Pode
            errar: a pauta completa continua abaixo.
          </p>
        </>
      )}
    </section>
  );
}
