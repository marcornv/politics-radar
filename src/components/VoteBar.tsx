import { VOTO_INFO } from "@/lib/votos";

/** Compact Sim / Não / Abstenção strip with direct numeric labels. */
export function PlacarMini({ sim, nao, abstencao }: { sim: number; nao: number; abstencao: number }) {
  const total = sim + nao + abstencao || 1;
  return (
    <div className="w-full min-w-[120px]">
      <div className="flex h-1.5 gap-[2px] overflow-hidden rounded-full" aria-hidden>
        {sim > 0 && <span style={{ flexGrow: sim, background: VOTO_INFO.sim.cor }} />}
        {nao > 0 && <span style={{ flexGrow: nao, background: VOTO_INFO.nao.cor }} />}
        {abstencao > 0 && <span style={{ flexGrow: abstencao, background: VOTO_INFO.abstencao.cor }} />}
      </div>
      <div className="tnum mt-1 flex gap-3 text-[11.5px] text-ink-2">
        <span>
          <span className="text-ink">{sim}</span> sim
        </span>
        <span>
          <span className="text-ink">{nao}</span> não
        </span>
        {abstencao > 0 && (
          <span>
            <span className="text-ink">{abstencao}</span> abst.
          </span>
        )}
        <span className="sr-only">de {total} votos</span>
      </div>
    </div>
  );
}

export function ResultadoChip({ aprovada }: { aprovada: boolean | null }) {
  if (aprovada == null) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-px text-[11.5px] font-medium ${
        aprovada ? "border-[color:var(--v-sim)]/50 text-[color:var(--v-sim)]" : "border-[color:var(--v-nao)]/50 text-[color:var(--v-nao)]"
      }`}
    >
      <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden>
        {aprovada ? (
          <path d="M1.5 5.5 4 8 8.5 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        ) : (
          <path d="M2 2l6 6M8 2 2 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        )}
      </svg>
      {aprovada ? "Aprovada" : "Rejeitada"}
    </span>
  );
}
