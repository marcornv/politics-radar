"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Casa } from "@/lib/types";

function casaFrom(path: string): Casa | null {
  const seg = path.split("/")[1];
  return seg === "camara" || seg === "senado" ? seg : null;
}

export function Nav() {
  const path = usePathname();
  const atual = casaFrom(path);
  const casa = atual ?? "camara";

  const items = [
    { href: "/", label: "Painel", active: path === "/" },
    {
      href: `/${casa}`,
      label: "Composição",
      active: atual !== null && (path.split("/").length === 2 || /\/parlamentares\//.test(path)),
    },
    { href: `/${casa}/votacoes`, label: "Votações", active: /\/votacoes/.test(path) },
    { href: `/${casa}/tramitacao`, label: "Tramitação", active: /\/(tramitacao|proposicoes)/.test(path) },
    { href: "/emendas", label: "Emendas", active: path.startsWith("/emendas") },
    { href: "/agenda", label: "Agenda da semana", active: path.startsWith("/agenda") },
  ];
  // Mobile has no side rail; settings join the horizontal section list.
  const itensMobile = [
    ...items,
    { href: "/configuracoes", label: "Configurações", active: path.startsWith("/configuracoes") },
  ];

  // Switching house keeps the current section; detail pages fall back to their list.
  const trocar = (c: Casa) => {
    if (!atual) return `/${c}`;
    const [, , sec] = path.split("/");
    if (sec === "votacoes") return `/${c}/votacoes`;
    if (sec === "tramitacao" || sec === "proposicoes") return `/${c}/tramitacao`;
    // a member only belongs to one house: fall back to that house's composition
    return `/${c}`;
  };

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur lg:h-dvh lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:flex-col lg:items-stretch lg:gap-8 lg:px-5 lg:py-8">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Radar Legislativo, início">
          <svg width="30" height="18" viewBox="0 0 30 18" aria-hidden>
            <path d="M2 17a13 13 0 0 1 26 0" fill="none" stroke="var(--line-strong)" strokeWidth="1.5" />
            <path d="M8 17a7 7 0 0 1 14 0" fill="none" stroke="var(--line-strong)" strokeWidth="1.5" />
            <path d="M15 17 L25 6" stroke="var(--phosphor)" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="15" cy="17" r="1.8" fill="var(--phosphor)" />
          </svg>
          <span className="font-display text-[17px] font-semibold leading-none">
            Radar <span className="text-ink-2 font-normal">Legislativo</span>
          </span>
        </Link>

        <div
          role="group"
          aria-label="Casa legislativa"
          className="ml-auto flex rounded-full border border-line p-0.5 text-[13px] lg:ml-0"
        >
          {(["camara", "senado"] as Casa[]).map((c) => {
            const on = atual === c;
            return (
              <Link
                key={c}
                href={trocar(c)}
                aria-current={on ? "true" : undefined}
                className={`flex-1 rounded-full px-3 py-1 text-center transition-colors ${
                  on ? "bg-phosphor text-bg font-semibold" : "text-ink-2 hover:text-ink"
                }`}
              >
                {c === "camara" ? "Câmara" : "Senado"}
              </Link>
            );
          })}
        </div>

        <nav aria-label="Seções" className="hidden lg:block">
          <ul className="space-y-0.5">
            {items.map((it) => (
              <li key={it.label}>
                <Link
                  href={it.href}
                  aria-current={it.active ? "page" : undefined}
                  className={`relative block rounded-lg px-3 py-2 text-[14px] transition-colors ${
                    it.active ? "bg-panel-2 text-ink" : "text-ink-2 hover:bg-panel hover:text-ink"
                  }`}
                >
                  {it.active && (
                    <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-phosphor" aria-hidden />
                  )}
                  {it.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <Link
          href="/configuracoes"
          aria-current={path.startsWith("/configuracoes") ? "page" : undefined}
          className={`hidden items-center gap-2 rounded-lg px-3 py-2 text-[14px] lg:mt-auto lg:flex ${
            path.startsWith("/configuracoes") ? "bg-panel-2 text-ink" : "text-ink-2 hover:bg-panel hover:text-ink"
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="8" cy="8" r="2.3" />
            <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" strokeLinecap="round" />
          </svg>
          Configurações
        </Link>

        <p className="hidden text-[12px] leading-relaxed text-muted lg:block">
          Dados abertos da Câmara dos Deputados e do Senado Federal. Atualizados a cada poucos minutos.
        </p>
      </div>

      <nav aria-label="Seções" className="overflow-x-auto px-4 pb-2 sm:px-6 lg:hidden">
        <ul className="flex gap-1 whitespace-nowrap text-[13px]">
          {itensMobile.map((it) => (
            <li key={it.label}>
              <Link
                href={it.href}
                aria-current={it.active ? "page" : undefined}
                className={`block rounded-md px-2.5 py-1.5 ${it.active ? "bg-panel-2 text-ink" : "text-ink-2"}`}
              >
                {it.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
