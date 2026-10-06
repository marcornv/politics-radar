const TZ = "America/Sao_Paulo";

/** YYYY-MM-DD for a Date, in Brasília time. */
export function isoDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function today(): string {
  return isoDay(new Date());
}

/** Monday of the week containing `day`. */
export function weekStart(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  return addDays(day, -dow);
}

export function compact(day: string): string {
  return day.replaceAll("-", "");
}

export function parseDay(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

const fmtDay = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "short" });
const fmtDayLong = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const fmtTime = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const fmtFull = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });

/** Source timestamps have no offset; they are Brasília local time. */
export function toDate(s: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00-03:00`);
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s);
  return new Date(`${s.replace(" ", "T")}-03:00`);
}

export const formatDay = (s: string) => fmtDay.format(toDate(s)).replace(".", "");
export const formatDayLong = (s: string) => fmtDayLong.format(toDate(s));
export const formatTime = (s: string) => fmtTime.format(toDate(s));
export const formatDate = (s: string) => fmtFull.format(toDate(s));

export function hasTime(s: string): boolean {
  return /T\d{2}:\d{2}/.test(s) && !/T00:00(:00)?/.test(s);
}
