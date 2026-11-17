/**
 * Advanced analytics over closed trades. Pure functions — shared by the Analytics page and the
 * AI assistant's tools so both always report identical numbers.
 *
 * Honesty rules baked in: every group carries its sample size `n`; groups below MIN_GROUP are
 * flagged `lowSample`; "not recorded" (null) is its own bucket and never merged into "no".
 */
import { bucketByPeriod, chronological, summarize, type StatTrade, type Summary } from "./stats";
import { roundMoney } from "./money";

export const MIN_GROUP = 10;

export const ICT_KEYS = ["liquidity_sweep", "displacement", "mss", "bos", "fvg", "order_block", "smt_divergence", "tf_alignment"] as const;
export const PSYCH_KEYS = ["was_planned", "followed_rules", "entered_early", "exited_early", "moved_stop", "revenge_trade", "overtraded"] as const;
export const MISTAKE_FLAGS = ["entered_early", "exited_early", "moved_stop", "revenge_trade", "overtraded"] as const;
export type IctKey = (typeof ICT_KEYS)[number];
export type PsychKey = (typeof PSYCH_KEYS)[number];

export interface AnalyticsTrade extends StatTrade {
  account_id: string;
  instrument_id: string;
  strategy_id: string | null;
  direction: "long" | "short";
  session: string | null;
  trade_type: string;
  daily_bias: string | null;
  holding_seconds: number | null;
  tag_ids: string[];
  flags: Partial<Record<IctKey | PsychKey, boolean | null>>;
}

export interface GroupRow {
  key: string;
  n: number;
  lowSample: boolean;
  winRate: number | null;
  netPnl: number;
  avgR: number | null;
  expectancy: number | null;
  profitFactor: number | null;
  avgWin: number | null;
  avgLoss: number | null;
}

function toRow(key: string, s: Summary): GroupRow {
  return {
    key, n: s.closedTrades, lowSample: s.closedTrades < MIN_GROUP, winRate: s.winRate, netPnl: s.netPnl,
    avgR: s.avgR, expectancy: s.expectancy, profitFactor: s.profitFactor, avgWin: s.avgWin, avgLoss: s.avgLoss,
  };
}

/** Group closed trades by a key (null key → skipped) and summarise each group, best net first. */
export function groupBy(trades: AnalyticsTrade[], keyOf: (t: AnalyticsTrade) => string | string[] | null): GroupRow[] {
  const groups = new Map<string, AnalyticsTrade[]>();
  for (const t of trades) {
    if (t.status !== "closed") continue;
    const k = keyOf(t);
    for (const key of Array.isArray(k) ? k : k == null ? [] : [k]) {
      const list = groups.get(key) ?? [];
      list.push(t);
      groups.set(key, list);
    }
  }
  return [...groups.entries()].map(([k, list]) => toRow(k, summarize(list))).sort((a, b) => b.netPnl - a.netPnl);
}

export const flagState = (v: boolean | null | undefined) => (v === true ? "yes" : v === false ? "no" : "unrecorded");

export function durationBucket(seconds: number | null): string | null {
  if (seconds == null) return null;
  if (seconds < 5 * 60) return "lt5m";
  if (seconds < 15 * 60) return "5to15m";
  if (seconds < 60 * 60) return "15to60m";
  if (seconds < 4 * 3600) return "1to4h";
  return "gt4h";
}
export const DURATION_ORDER = ["lt5m", "5to15m", "15to60m", "1to4h", "gt4h"];

export function weekdayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return String(new Date(Date.UTC(y, m - 1, d)).getUTCDay()); // 0 = Sunday
}

export function sessionGroup(session: string | null): string | null {
  if (!session) return null;
  return session.startsWith("ny_") ? "ny" : session;
}

/** Dimensions available for breakdowns and comparisons. `key` values are stable ids, labels are resolved by the UI. */
export const DIMENSIONS = {
  instrument: (t: AnalyticsTrade) => t.instrument_id,
  session: (t: AnalyticsTrade) => t.session ?? "unset",
  sessionGroup: (t: AnalyticsTrade) => sessionGroup(t.session) ?? "unset",
  direction: (t: AnalyticsTrade) => t.direction,
  strategy: (t: AnalyticsTrade) => t.strategy_id ?? "none",
  tradeType: (t: AnalyticsTrade) => t.trade_type,
  account: (t: AnalyticsTrade) => t.account_id,
  dailyBias: (t: AnalyticsTrade) => t.daily_bias ?? "unrecorded",
  weekday: (t: AnalyticsTrade) => weekdayOf(t.trade_date),
  duration: (t: AnalyticsTrade) => durationBucket(t.holding_seconds) ?? "unrecorded",
  tag: (t: AnalyticsTrade) => t.tag_ids,
  ...Object.fromEntries([...ICT_KEYS, ...PSYCH_KEYS].map((k) => [k, (t: AnalyticsTrade) => flagState(t.flags[k])])),
} as Record<string, (t: AnalyticsTrade) => string | string[] | null>;
export type DimensionId = keyof typeof DIMENSIONS;

export function matches(t: AnalyticsTrade, dim: string, value: string): boolean {
  const f = DIMENSIONS[dim];
  if (!f) return false;
  const k = f(t);
  return Array.isArray(k) ? k.includes(value) : k === value;
}

export interface Comparison { a: GroupRow; b: GroupRow; diffNet: number; diffWinRate: number | null; enoughData: boolean }

export function compare(a: AnalyticsTrade[], b: AnalyticsTrade[], labels: [string, string] = ["A", "B"]): Comparison {
  const ra = toRow(labels[0], summarize(a.filter((t) => t.status === "closed")));
  const rb = toRow(labels[1], summarize(b.filter((t) => t.status === "closed")));
  return {
    a: ra, b: rb,
    diffNet: roundMoney(ra.netPnl - rb.netPnl),
    diffWinRate: ra.winRate != null && rb.winRate != null ? ra.winRate - rb.winRate : null,
    enoughData: !ra.lowSample && !rb.lowSample,
  };
}

/** Last n closed trades vs the n before them (chronological). */
export function lastVsPrevious(trades: AnalyticsTrade[], n: number): Comparison {
  const closed = chronological(trades.filter((t) => t.status === "closed"));
  const last = closed.slice(-n);
  const prev = closed.slice(-2 * n, -n);
  return compare(last, prev, [`last${n}`, `prev${n}`]);
}

export interface MistakeRow { key: string; kind: "flag" | "tag"; count: number; netPnl: number; avgR: number | null; share: number }

/** How often each execution mistake occurred and the net P/L of the trades where it did. */
export function mistakes(trades: AnalyticsTrade[], mistakeTagIds: string[]): MistakeRow[] {
  const closed = trades.filter((t) => t.status === "closed");
  const rows: MistakeRow[] = [];
  const push = (key: string, kind: MistakeRow["kind"], list: AnalyticsTrade[]) => {
    if (!list.length) return;
    const s = summarize(list);
    rows.push({ key, kind, count: list.length, netPnl: s.netPnl, avgR: s.avgR, share: closed.length ? list.length / closed.length : 0 });
  };
  for (const f of MISTAKE_FLAGS) push(f, "flag", closed.filter((t) => t.flags[f] === true));
  push("followed_rules_no", "flag", closed.filter((t) => t.flags.followed_rules === false));
  for (const id of mistakeTagIds) push(id, "tag", closed.filter((t) => t.tag_ids.includes(id)));
  return rows.sort((a, b) => b.count - a.count || a.netPnl - b.netPnl);
}

export interface DrawdownStats {
  maxDrawdown: number;
  currentDrawdown: number;
  longestUnderwater: number; // consecutive closed trades below the previous equity peak
  currentUnderwater: number;
  peak: number;
}

export function drawdownStats(trades: StatTrade[]): DrawdownStats {
  const closed = chronological(trades.filter((t) => t.status === "closed"));
  let eq = 0, peak = 0, maxDd = 0, under = 0, longest = 0;
  for (const t of closed) {
    eq += Number(t.net_pnl ?? 0);
    if (eq >= peak) { peak = eq; under = 0; } else { under++; }
    maxDd = Math.max(maxDd, peak - eq);
    longest = Math.max(longest, under);
  }
  return { maxDrawdown: roundMoney(maxDd), currentDrawdown: roundMoney(peak - eq), longestUnderwater: longest, currentUnderwater: under, peak: roundMoney(peak) };
}

export function bestWorstDays(trades: StatTrade[]) {
  const days = bucketByPeriod(trades, "day");
  if (!days.length) return { best: null, worst: null, days: 0, greenDays: 0 };
  const best = days.reduce((a, b) => (b.netPnl > a.netPnl ? b : a));
  const worst = days.reduce((a, b) => (b.netPnl < a.netPnl ? b : a));
  return { best, worst, days: days.length, greenDays: days.filter((d) => d.netPnl > 0).length };
}

/** Best/worst group by net P/L among groups with enough data (falls back to all groups, flagged). */
export function bestWorstGroup(rows: GroupRow[]) {
  const pool = rows.filter((r) => !r.lowSample);
  const list = pool.length ? pool : rows;
  if (!list.length) return { best: null, worst: null, reliable: false };
  return { best: list[0], worst: list[list.length - 1], reliable: pool.length > 0 };
}
