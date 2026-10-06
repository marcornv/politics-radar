export class UpstreamError extends Error {
  constructor(
    public url: string,
    public status: number,
  ) {
    super(`Fonte oficial respondeu ${status} para ${url}`);
  }
}

/** GET JSON from a public API with a timeout and a couple of retries. */
export async function getJson<T>(url: string, { retries = 2, timeoutMs = 20_000 } = {}): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      if (res.status === 404) throw new UpstreamError(url, 404);
      if (!res.ok) throw new UpstreamError(url, res.status);
      const text = await res.text();
      if (!text.trim()) return [] as unknown as T;
      return JSON.parse(text) as T;
    } catch (err) {
      lastErr = err;
      if (err instanceof UpstreamError && err.status < 500 && err.status !== 429) throw err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/** The Senado XML→JSON bridge returns a bare object when a list has one element. */
export function asArray<T>(v: T | T[] | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}
