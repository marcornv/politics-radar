import "server-only";
import { headers } from "next/headers";

const LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const IP = /^(\d{1,3}\.){3}\d{1,3}$|^\[[0-9a-f:.]+\]$/i;

function nomeDoHost(host: string): string {
  return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
}

/**
 * True when the page is being viewed on the machine running the app, not from another device on the network.
 * The Host header is set by the client, so this only stops browsers (and DNS rebinding), not a hostile program
 * on the network; that is why the scripts bind to 127.0.0.1 by default.
 */
export async function ehAcessoLocal(): Promise<boolean> {
  return LOCAIS.has(nomeDoHost((await headers()).get("host") ?? ""));
}

/**
 * Rejects requests that another website makes through the user's browser: cross-site POSTs (CSRF) and
 * DNS rebinding, where a hostile domain resolves to this machine. Devices on the network that open the
 * Radar by IP still pass.
 */
export function ehMesmaOrigem(req: Request): boolean {
  const host = req.headers.get("host") ?? "";
  const nome = nomeDoHost(host);
  if (!LOCAIS.has(nome) && !IP.test(nome)) return false;
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
