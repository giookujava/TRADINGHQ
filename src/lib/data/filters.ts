import { SESSIONS, TRADE_TYPES } from "@/lib/constants";

export interface TradeFilters {
  from?: string;
  to?: string;
  account?: string;
  instrument?: string;
  type?: string;
  session?: string;
  direction?: "long" | "short";
  strategy?: string;
  status?: "open" | "closed";
  sample: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SP = Record<string, string | string[] | undefined>;
const one = (sp: SP, k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

/** Parse and whitelist filter query params (anything invalid is ignored). */
export function parseFilters(sp: SP): TradeFilters {
  const f: TradeFilters = { sample: one(sp, "sample") === "1" };
  const from = one(sp, "from"), to = one(sp, "to");
  if (from && DATE_RE.test(from)) f.from = from;
  if (to && DATE_RE.test(to)) f.to = to;
  for (const k of ["account", "instrument", "strategy"] as const) {
    const v = one(sp, k);
    if (v && UUID_RE.test(v)) f[k] = v;
  }
  const type = one(sp, "type");
  if (type && (TRADE_TYPES as readonly string[]).includes(type)) f.type = type;
  const session = one(sp, "session");
  if (session && ((SESSIONS as readonly string[]).includes(session) || session === "ny")) f.session = session;
  const dir = one(sp, "direction");
  if (dir === "long" || dir === "short") f.direction = dir;
  const status = one(sp, "status");
  if (status === "open" || status === "closed") f.status = status;
  return f;
}

export function filtersToSearch(f: TradeFilters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (k === "sample") { if (v) p.set("sample", "1"); continue; }
    if (v) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function hasActiveFilters(f: TradeFilters): boolean {
  return Boolean(f.from || f.to || f.account || f.instrument || f.type || f.session || f.direction || f.strategy || f.status);
}
