import Link from "next/link";

export function PageHeader({
  title,
  lead,
  children,
}: {
  title: React.ReactNode;
  lead?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-3 lg:mb-8">
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-[clamp(26px,3.4vw,38px)] font-semibold leading-[1.1] text-ink">{title}</h1>
        {lead && <p className="mt-2 max-w-[68ch] text-[15px] text-ink-2">{lead}</p>}
      </div>
      {children}
    </header>
  );
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-[17px] font-semibold text-ink">{children}</h2>
      {aside}
    </div>
  );
}

export function FonteIndisponivel({ casa, detalhe }: { casa?: string; detalhe?: string }) {
  return (
    <div className="panel border-dashed p-6 text-[14px] text-ink-2">
      <p className="font-medium text-ink">
        A fonte oficial {casa ? `do ${casa} ` : ""}não respondeu agora.
      </p>
      <p className="mt-1">
        As APIs de dados abertos às vezes ficam lentas. Recarregue a página em alguns instantes; o que já foi
        carregado antes continua disponível no cache local.
      </p>
      {detalhe && <p className="mt-2 text-[12px] text-muted">{detalhe}</p>}
    </div>
  );
}

/** Indeterminate loading bar in the radar idiom, for slow upstream lookups. */
export function Escaneando({ label, linhas = 3 }: { label: string; linhas?: number }) {
  return (
    <div className="panel p-5" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-[13px] text-ink-2">
        <span className="relative h-1 w-28 overflow-hidden rounded-full bg-line">
          <span className="scanline absolute inset-y-0 left-0 w-1/3 rounded-full bg-phosphor/70" />
        </span>
        {label}
      </div>
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i} className="h-10 rounded-md bg-panel-2/70" style={{ opacity: 1 - i * 0.22 }} />
        ))}
      </div>
    </div>
  );
}

export function Chip({
  children,
  tone = "default",
  title,
}: {
  children: React.ReactNode;
  tone?: "default" | "ok" | "bad" | "warn" | "info";
  title?: string;
}) {
  const tones = {
    default: "border-line text-ink-2",
    ok: "border-[color:var(--v-sim)]/50 text-[color:var(--v-sim)]",
    bad: "border-[color:var(--v-nao)]/50 text-[color:var(--v-nao)]",
    warn: "border-amber/50 text-amber",
    info: "border-phosphor/40 text-phosphor",
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-px text-[11.5px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function SegLinks({
  items,
  label,
}: {
  items: { href: string; label: string; active: boolean }[];
  label: string;
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1 rounded-lg border border-line p-0.5 text-[13px]">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          scroll={false}
          aria-current={it.active ? "true" : undefined}
          className={`rounded-md px-2.5 py-1 ${it.active ? "bg-panel-2 text-ink" : "text-ink-2 hover:text-ink"}`}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

export function TransparenciaAviso() {
  return (
    <div className="rounded-lg border border-dashed border-line p-5 text-[13.5px] text-ink-2">
      <p className="font-medium text-ink">Emendas ao orçamento precisam de uma chave do Portal da Transparência</p>
      <p className="mt-1">
        A chave é gratuita e leva poucos minutos para conseguir. Veja o passo a passo e cole a chave em{" "}
        <Link href="/configuracoes" className="text-phosphor hover:underline">
          Configurações
        </Link>
        .
      </p>
    </div>
  );
}
