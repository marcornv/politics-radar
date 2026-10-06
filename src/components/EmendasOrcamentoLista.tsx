"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatBRL, formatBRLCompacto, STATUS_ORCAMENTO } from "@/lib/orcamento";
import type { EmendaOrcamento, StatusOrcamento } from "@/lib/types";
import type { AutorLink } from "./EmendasProjetoLista";

const ORDEM: StatusOrcamento[] = ["paga", "paga_parcial", "liquidada", "empenhada", "sem_execucao"];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function EmendasOrcamentoLista({
  itens,
  mostrarAutor = false,
  autores = {},
}: {
  itens: EmendaOrcamento[];
  mostrarAutor?: boolean;
  /** Profile link keyed by author name as published by the portal. */
  autores?: Record<string, AutorLink>;
}) {
  const [soConcluidas, setSoConcluidas] = useState(false);
  const [status, setStatus] = useState<StatusOrcamento | null>(null);
  const [q, setQ] = useState("");
  const [limite, setLimite] = useState(50);

  const lista = useMemo(() => {
    const nq = norm(q.trim());
    return itens
      .filter(
        (e) =>
          (!soConcluidas || e.status === "paga") &&
          (!status || e.status === status) &&
          (!nq || norm(`${e.autor} ${e.localidade} ${e.funcao} ${e.subfuncao} ${e.tipo}`).includes(nq)),
      )
      .sort((a, b) => b.empenhado - a.empenhado);
  }, [itens, soConcluidas, status, q]);

  const tot = useMemo(
    () => lista.reduce((a, e) => ({ emp: a.emp + e.empenhado, pago: a.pago + e.pago }), { emp: 0, pago: 0 }),
    [lista],
  );
  const contagem = useMemo(() => {
    const c = Object.fromEntries(ORDEM.map((s) => [s, 0])) as Record<StatusOrcamento, number>;
    for (const e of itens) c[e.status]++;
    return c;
  }, [itens]);

  if (itens.length === 0) {
    return <p className="panel p-6 text-[14px] text-ink-2">Nenhuma emenda ao orçamento encontrada para essa busca.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="panel p-4">
          <div className="text-[12px] text-ink-2">Empenhado</div>
          <div className="font-display tnum mt-1 text-[24px] font-semibold leading-none">{formatBRLCompacto(tot.emp)}</div>
          <div className="mt-1 text-[11.5px] text-muted">valor reservado no orçamento</div>
        </div>
        <div className="panel p-4">
          <div className="text-[12px] text-ink-2">Pago</div>
          <div className="font-display tnum mt-1 text-[24px] font-semibold leading-none text-phosphor">
            {formatBRLCompacto(tot.pago)}
          </div>
          <div className="mt-1 text-[11.5px] text-muted">dinheiro que de fato saiu</div>
        </div>
        <div className="panel p-4">
          <div className="text-[12px] text-ink-2">Execução</div>
          <div className="font-display tnum mt-1 text-[24px] font-semibold leading-none">
            {tot.emp ? `${Math.round((tot.pago / tot.emp) * 100)}%` : "n/d"}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
            <div className="h-full rounded-full bg-phosphor" style={{ width: `${tot.emp ? Math.min(100, (tot.pago / tot.emp) * 100) : 0}%` }} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-2.5 py-0.5 text-[12.5px] text-ink-2">
          <input
            type="checkbox"
            checked={soConcluidas}
            onChange={(e) => {
              setSoConcluidas(e.target.checked);
              setStatus(null);
            }}
            className="accent-[var(--phosphor)]"
          />
          Só concluídas (totalmente pagas)
        </label>
        {!soConcluidas && (
          <div role="group" aria-label="Situação" className="flex flex-wrap gap-1">
            {ORDEM.filter((s) => contagem[s] > 0).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                onClick={() => setStatus((x) => (x === s ? null : s))}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12.5px] ${
                  status === s ? "border-phosphor bg-phosphor/10 text-phosphor" : "border-line text-ink-2 hover:text-ink"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: STATUS_ORCAMENTO[s].cor }} aria-hidden />
                {STATUS_ORCAMENTO[s].label} <span className="tnum text-muted">{contagem[s]}</span>
              </button>
            ))}
          </div>
        )}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por local, área ou autor"
          aria-label="Buscar emendas ao orçamento"
          className="w-full rounded-md border border-line bg-bg px-3 py-1.5 text-[13px] placeholder:text-muted sm:ml-auto sm:w-64"
        />
      </div>

      {lista.length === 0 ? (
        <p className="panel p-6 text-center text-[14px] text-ink-2">Nenhuma emenda com esse filtro.</p>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-muted">
                {mostrarAutor && <th className="px-4 py-2 font-normal">Autor</th>}
                <th className="px-4 py-2 font-normal">Destino</th>
                <th className="px-4 py-2 font-normal">Tipo</th>
                <th className="px-4 py-2 text-right font-normal">Empenhado</th>
                <th className="w-[180px] px-4 py-2 font-normal">Pago</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lista.slice(0, limite).map((e) => {
                const autor = autores[e.autor];
                const pct = e.empenhado ? Math.min(1, e.pago / e.empenhado) : e.pago > 0 ? 1 : 0;
                return (
                  <tr key={`${e.codigo}-${e.ano}`} className="align-top">
                    {mostrarAutor && (
                      <td className="px-4 py-2.5">
                        {autor ? (
                          <Link href={autor.href} className="text-ink underline decoration-line-strong underline-offset-[3px] hover:text-phosphor">
                            {autor.nome}
                          </Link>
                        ) : (
                          <span className="text-ink">{e.autor}</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-2.5">
                      <div className="text-ink">{e.localidade || "Não informado"}</div>
                      <div className="text-[12px] text-ink-2">
                        {e.funcao}
                        {e.subfuncao && e.subfuncao !== e.funcao ? `, ${e.subfuncao.toLowerCase()}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-ink-2">
                      {e.tipo.replace(/^Emenda /, "")}
                      <div className="tnum text-muted">
                        nº {e.numero}, {e.ano}
                      </div>
                    </td>
                    <td className="tnum px-4 py-2.5 text-right text-ink">{formatBRL(e.empenhado)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
                          <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: STATUS_ORCAMENTO[e.status].cor }} />
                        </div>
                        <span className="tnum w-24 text-right text-ink">{formatBRL(e.pago)}</span>
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-ink-2">{STATUS_ORCAMENTO[e.status].label}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {lista.length > limite && (
        <button
          type="button"
          onClick={() => setLimite((l) => l + 50)}
          className="w-full rounded-lg border border-line py-2 text-[13px] text-phosphor hover:border-line-strong"
        >
          Mostrar mais ({lista.length - limite} restantes)
        </button>
      )}
    </div>
  );
}
