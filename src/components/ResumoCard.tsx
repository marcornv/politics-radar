"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { lerParcial } from "@/lib/json-parcial";
import type { EventoResumo, Resumo } from "@/lib/resumo";
import type { Casa } from "@/lib/types";

/** While generating: waiting for the first token, reasoning, or writing the answer (shown as it comes). */
type Gerando = { tipo: "gerando"; inicio: number; fase: "esperando" | "pensando" | "escrevendo"; parcial: Partial<Resumo> | null };

type Estado =
  | { tipo: "inativo" }
  | Gerando
  | { tipo: "ok"; resumo: Resumo; comLeitor: boolean }
  | { tipo: "erro"; msg: string };

const FALHA = "Falha ao gerar o resumo.";

/** Reads the route's NDJSON stream (one `EventoResumo` per line), reporting each step through `mostrar`. */
async function pedirResumo(casa: Casa, id: string, comLeitor: boolean, mostrar: (e: Estado) => void) {
  let atual: Gerando = { tipo: "gerando", inicio: Date.now(), fase: "esperando", parcial: null };
  let texto = "";
  mostrar(atual);
  try {
    const r = await fetch(`/api/resumo/${casa}/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comLeitor }),
    });
    // Checks that fail before the model is called still answer with a JSON error.
    if (!r.ok || !r.body || !r.headers.get("Content-Type")?.includes("ndjson")) {
      const j = await r.json().catch(() => null);
      throw new Error(j?.erro ?? FALHA);
    }
    const leitor = r.body.pipeThrough(new TextDecoderStream()).getReader();
    let resto = "";
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) break;
      const linhas = (resto + value).split("\n");
      resto = linhas.pop() ?? "";
      for (const linha of linhas) {
        if (!linha.trim()) continue;
        const e = JSON.parse(linha) as EventoResumo;
        if (e.tipo === "pronto") return mostrar({ tipo: "ok", resumo: e.resumo, comLeitor });
        if (e.tipo === "erro") throw new Error(e.erro);
        if (e.tipo === "pensando") {
          if (atual.fase !== "escrevendo") atual = { ...atual, fase: "pensando" };
        } else {
          texto += e.delta;
          // A cut that can't be parsed yet keeps the last good version on screen.
          atual = { ...atual, fase: "escrevendo", parcial: lerParcial<Resumo>(texto) ?? atual.parcial };
        }
        mostrar(atual);
      }
    }
    throw new Error("A resposta da IA terminou antes do resumo.");
  } catch (e) {
    mostrar({ tipo: "erro", msg: e instanceof Error ? e.message : FALHA });
  }
}

const FASE: Record<Gerando["fase"], string> = {
  esperando: "Gerando resumo…",
  pensando: "Pensando…",
  escrevendo: "Escrevendo…",
};

/** Seconds since `inicio`, ticking once a second. */
function Decorrido({ inicio }: { inicio: number }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{Math.max(0, Math.floor((agora - inicio) / 1000))} s</>;
}

/** The summary's fields; also used while they are still being written, so any of them may be missing. */
function Campos({ resumo }: { resumo: Partial<Resumo> }) {
  const texto = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
  const mudancas = Array.isArray(resumo.mudancas) ? resumo.mudancas.filter(texto) : [];
  return (
    <div className="space-y-3 text-[14px] leading-relaxed text-ink">
      {texto(resumo.sintese) && <p>{resumo.sintese}</p>}
      {mudancas.length > 0 && (
        <ul className="space-y-1 pl-4 text-ink-2 [list-style:square] marker:text-phosphor-dim">
          {mudancas.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
      <dl className="grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-[110px_1fr]">
        {texto(resumo.paraVoce) && (
          <>
            <dt className="text-phosphor">Para você</dt>
            <dd className="text-ink">{resumo.paraVoce}</dd>
          </>
        )}
        {texto(resumo.afetados) && (
          <>
            <dt className="text-muted">Quem é afetado</dt>
            <dd className="text-ink-2">{resumo.afetados}</dd>
          </>
        )}
        {texto(resumo.proximoPasso) && (
          <>
            <dt className="text-muted">Próximo passo</dt>
            <dd className="text-ink-2">{resumo.proximoPasso}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

/**
 * Plain-language summary from the AI chosen in Configurações. Shown only when one is configured and
 * generated only when the reader clicks, with or without "Sobre você"; each version is cached on disk.
 */
export function ResumoCard({
  casa,
  id,
  disponivel,
  temPerfil = false,
}: {
  casa: Casa;
  id: string;
  disponivel: boolean;
  /** Whether "Sobre você" is filled in, which allows a summary with a "Para você" item. */
  temPerfil?: boolean;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: "inativo" });
  const [comLeitor, setComLeitor] = useState(temPerfil);

  const gerar = (usarPerfil = comLeitor) => {
    setComLeitor(usarPerfil);
    void pedirResumo(casa, id, usarPerfil, setEstado);
  };

  if (!disponivel) {
    return (
      <div className="rounded-lg border border-dashed border-line p-4 text-[13px] text-ink-2">
        <p className="font-medium text-ink">Resumo em linguagem simples desativado</p>
        <p className="mt-1">
          Para gerar resumos, configure uma IA (Anthropic, OpenAI, Groq ou um modelo local) em{" "}
          <Link href="/configuracoes" className="text-phosphor hover:underline">
            Configurações
          </Link>
          . A ementa oficial continua acima.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-phosphor/25 bg-phosphor/[0.04] p-4">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="font-display text-[14px] font-semibold text-phosphor">Em linguagem simples</h3>
        {estado.tipo === "ok" && (
          <span className="ml-auto text-[11px] text-muted">
            gerado por IA (<code>{estado.resumo.modelo}</code>) a partir dos dados oficiais
          </span>
        )}
      </div>

      {estado.tipo === "inativo" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => gerar()}
            className="rounded-md bg-phosphor px-4 py-1.5 text-[13px] font-semibold text-bg hover:brightness-110"
          >
            Gerar resumo
          </button>
          {temPerfil && (
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
              <input
                type="checkbox"
                checked={comLeitor}
                onChange={(e) => setComLeitor(e.target.checked)}
                className="accent-phosphor"
              />
              Usar meu &ldquo;Sobre você&rdquo;
            </label>
          )}
        </div>
      )}

      {estado.tipo === "gerando" && (
        <div className="space-y-3">
          <p role="status" className="text-[12px] text-muted">
            {FASE[estado.fase]} <Decorrido inicio={estado.inicio} />
          </p>
          {estado.parcial ? (
            // Re-read on every token; screen readers get the finished summary instead.
            <div aria-hidden="true">
              <Campos resumo={estado.parcial} />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative h-3 w-4/5 overflow-hidden rounded bg-line">
                <span className="scanline absolute inset-y-0 left-0 w-1/3 bg-phosphor/30" />
              </div>
              <div className="h-3 w-3/5 rounded bg-line" />
              <div className="h-3 w-2/3 rounded bg-line" />
            </div>
          )}
        </div>
      )}

      {estado.tipo === "erro" && (
        <p className="text-[13px] text-ink-2">
          {estado.msg}{" "}
          <button type="button" onClick={() => gerar()} className="text-phosphor hover:underline">
            Tentar de novo
          </button>
        </p>
      )}

      {estado.tipo === "ok" && <Campos resumo={estado.resumo} />}

      {estado.tipo === "ok" && temPerfil && (
        <button
          type="button"
          onClick={() => gerar(!estado.comLeitor)}
          className="mt-3 text-[12px] text-phosphor hover:underline"
        >
          {estado.comLeitor ? "Ver o resumo sem o meu \u201cSobre você\u201d" : "Ver o resumo com o meu \u201cSobre você\u201d"}
        </button>
      )}
    </div>
  );
}
