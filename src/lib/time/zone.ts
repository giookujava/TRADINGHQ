/**
 * Timezone utilities built on Intl (IANA tz database) — DST is handled automatically.
 * Storage is always UTC; the UI reads/writes wall-clock time in the trading timezone
 * (default America/New_York).
 */

export const DEFAULT_TRADING_TZ = "America/New_York";

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface ZonedParts {
  year: number; month: number; day: number; hour: number; minute: number; second: number;
}

export function zonedParts(date: Date, tz: string): ZonedParts {
  const out: Record<string, number> = {};
  for (const p of dtf(tz).formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return { year: out.year, month: out.month, day: out.day, hour: out.hour % 24, minute: out.minute, second: out.second };
}

/** Offset of `tz` from UTC at instant `date`, in milliseconds (NY in winter: −5h). */
export function tzOffsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Convert a wall-clock time in `tz` ("YYYY-MM-DDTHH:mm[:ss]") to a UTC Date.
 * Ambiguous times (DST fall-back hour) resolve to the earlier instant; times inside the
 * spring-forward gap resolve forward by the gap length (e.g. 02:30 → 03:30 EDT).
 */
export function zonedTimeToUtc(local: string, tz: string): Date {
  const m = LOCAL_RE.exec(local.trim());
  if (!m) throw new Error(`Invalid local date-time: ${local}`);
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "0"].map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  // Two candidate offsets: the one in effect a few hours before and after the wall time.
  const o1 = tzOffsetMs(new Date(wall - 12 * 3600_000), tz);
  const o2 = tzOffsetMs(new Date(wall + 12 * 3600_000), tz);
  const candidates = [wall - o1, wall - o2].filter((t) => tzOffsetMs(new Date(t), tz) === wall - t);
  if (candidates.length) return new Date(Math.min(...candidates));
  // Gap: no valid instant; shift forward using the pre-transition offset.
  return new Date(wall - o1);
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** "YYYY-MM-DD" of instant in tz. */
export function dateInZone(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "YYYY-MM-DDTHH:mm:ss" wall-clock of instant in tz (for datetime-local inputs). */
export function localDateTimeInZone(date: Date, tz: string, withSeconds = true): string {
  const p = zonedParts(date, tz);
  const base = `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
  return withSeconds ? `${base}:${pad(p.second)}` : base;
}

export function todayInZone(tz: string): string {
  return dateInZone(new Date(), tz);
}

export function formatInZone(
  iso: string | Date | null | undefined,
  tz: string,
  opts: Intl.DateTimeFormatOptions = { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts }).format(d);
}

export function tzAbbreviation(date: Date, tz: string): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? tz;
}

// ---------------------------------------------------------------------------
// Trading sessions (New York wall-clock). Editable later; used as a default suggestion.
// ---------------------------------------------------------------------------
export const SESSIONS = ["asia", "london", "ny_am", "ny_lunch", "ny_pm", "other"] as const;
export type SessionKey = (typeof SESSIONS)[number];

export const SESSION_LABELS: Record<SessionKey, string> = {
  asia: "Asia",
  london: "London",
  ny_am: "New York AM",
  ny_lunch: "New York Lunch",
  ny_pm: "New York PM",
  other: "Other",
};

/** Windows in New York time, [startMinute, endMinute). */
export const SESSION_WINDOWS_NY: { key: SessionKey; start: number; end: number; label: string }[] = [
  { key: "asia", start: 18 * 60, end: 24 * 60, label: "18:00–02:00" },
  { key: "asia", start: 0, end: 2 * 60, label: "18:00–02:00" },
  { key: "london", start: 2 * 60, end: 7 * 60, label: "02:00–07:00" },
  { key: "ny_am", start: 7 * 60, end: 12 * 60, label: "07:00–12:00" },
  { key: "ny_lunch", start: 12 * 60, end: 13 * 60 + 30, label: "12:00–13:30" },
  { key: "ny_pm", start: 13 * 60 + 30, end: 17 * 60, label: "13:30–17:00" },
];

export function classifySession(instant: Date): SessionKey {
  const p = zonedParts(instant, "America/New_York");
  const minute = p.hour * 60 + p.minute;
  return SESSION_WINDOWS_NY.find((w) => minute >= w.start && minute < w.end)?.key ?? "other";
}
