import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_DIR = path.join(process.cwd(), ".cache");

type Entry = { at: number; value: unknown };

const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

function fileFor(key: string) {
  const hash = createHash("sha1").update(key).digest("hex");
  return path.join(CACHE_DIR, `${hash}.json`);
}

async function readDisk(key: string): Promise<Entry | null> {
  try {
    return JSON.parse(await readFile(fileFor(key), "utf8")) as Entry;
  } catch {
    return null;
  }
}

async function writeDisk(key: string, entry: Entry) {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(fileFor(key), JSON.stringify(entry));
  } catch {
    // Disk cache is best effort; memory still holds the value.
  }
}

export const MIN = 60_000;
export const HOUR = 60 * MIN;

/**
 * Memoise an async loader in memory and on disk for `ttl` ms.
 * Concurrent callers share one in-flight request. If the loader fails and a
 * stale value exists, the stale value is returned instead of throwing.
 */
export async function cached<T>(
  key: string,
  ttl: number,
  load: () => Promise<T>,
  { persist = true }: { persist?: boolean } = {},
): Promise<T> {
  const now = Date.now();
  let entry = memory.get(key) ?? null;
  if (!entry && persist) {
    entry = await readDisk(key);
    if (entry) memory.set(key, entry);
  }
  if (entry && now - entry.at < ttl) return entry.value as T;

  const running = inflight.get(key);
  if (running) return running as Promise<T>;

  const stale = entry;
  const p = (async () => {
    try {
      const value = await load();
      const fresh = { at: Date.now(), value };
      memory.set(key, fresh);
      if (persist) await writeDisk(key, fresh);
      return value;
    } catch (err) {
      if (stale) return stale.value as T;
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/** Run `fn` over `items` with at most `limit` concurrent calls. */
export async function mapLimit<I, O>(
  items: I[],
  limit: number,
  fn: (item: I) => Promise<O>,
): Promise<O[]> {
  const out = new Array<O>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
