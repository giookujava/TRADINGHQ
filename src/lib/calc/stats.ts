/**
 * Performance statistics over a set of trades. Pure functions.
 *
 * Definitions (shown in the UI next to each figure):
 *  - win / loss / breakeven: net P/L > 0 / < 0 / = 0
 *  - win rate: wins ÷ closed trades
 *  - gross profit / gross loss: Σ net P/L of winning / losing trades
 *  - profit factor: gross profit ÷ |gross loss|  (null when there are no losses)
 *  - expectancy: net P/L ÷ closed trades
 *  - max drawdown: largest peak-to-trough decline of cumulative net P/L
 */
import { roundMoney, roundTo, sum } from "./money";

export interface StatTrade {
  id: string;
  trade_date: string; // YYYY-MM-DD in trading timezone
  entry_time: string | null;
  exit_time: string | null;
  status: "open" | "closed";
  net_pnl: number | null;
  gross_pnl: number | null;
  total_fees: number | null;
  r_multiple: number | null;
}

export interface Summary {
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  pnlBeforeFees: number;
  totalFees: number;
  avgWin: number | null;
  avgLoss: number | null;
  largestWin: number | null;
  largestLoss: number | null;
  avgR: number | null;
  rSampleSize: number;
  expectancy: number | null;
  profitFactor: number | null;
  maxDrawdown: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
}

const num = (x: number | null | undefined) => (x == null ? 0 : Number(x));

/** Chronological order used for equity curves and streaks. */
export function chronological<T extends StatTrade>(trades: T[]): T[] {
  const key = (t: StatTrade) => t.exit_time ?? t.entry_time ?? `${t.trade_date}T23:59:59Z`;
  return [...trades].sort((a, b) => key(a).localeCompare(key(b)) || a.id.localeCompare(b.id));
}

export function summarize(trades: StatTrade[]): Summary {
  const closed = chronological(trades.filter((t) => t.status === "closed"));
  const nets = closed.map((t) => num(t.net_pnl));
  const winners = nets.filter((n) => n > 0);
  const losers = nets.filter((n) => n < 0);
  const grossProfit = roundMoney(sum(winners));
  const grossLoss = roundMoney(sum(losers));
  const netPnl = roundMoney(sum(nets));
  const totalFees = roundMoney(sum(closed.map((t) => num(t.total_fees))));
  const rs = closed.filter((t) => t.r_multiple != null).map((t) => Number(t.r_multiple));

  let streakW = 0, streakL = 0, maxW = 0, maxL = 0;
  for (const n of nets) {
    if (n > 0) { streakW++; streakL = 0; }
    else if (n < 0) { streakL++; streakW = 0; }
    else { streakW = 0; streakL = 0; }
    maxW = Math.max(maxW, streakW);
    maxL = Math.max(maxL, streakL);
  }

  return {
    totalTrades: trades.length,
    closedTrades: closed.length,
    openTrades: trades.length - closed.length,
    wins: winners.length,
    losses: losers.length,
    breakeven: closed.length - winners.length - losers.length,
    winRate: closed.length ? winners.length / closed.length : null,
    grossProfit,
    grossLoss,
    netPnl,
    pnlBeforeFees: roundMoney(netPnl + totalFees),
    totalFees,
    avgWin: winners.length ? roundMoney(grossProfit / winners.length) : null,
    avgLoss: losers.length ? roundMoney(grossLoss / losers.length) : null,
    largestWin: winners.length ? Math.max(...winners) : null,
    largestLoss: losers.length ? Math.min(...losers) : null,
    avgR: rs.length ? roundTo(sum(rs) / rs.length, 2) : null,
    rSampleSize: rs.length,
    expectancy: closed.length ? roundMoney(netPnl / closed.length) : null,
    profitFactor: losers.length ? roundTo(grossProfit / Math.abs(grossLoss), 2) : null,
    maxDrawdown: maxDrawdown(nets),
    maxConsecutiveWins: maxW,
    maxConsecutiveLosses: maxL,
  };
}

/** Largest peak-to-trough fall of cumulative P/L (returned as a positive number). */
export function maxDrawdown(pnls: number[], start = 0): number {
  let equity = start, peak = start, dd = 0;
  for (const p of pnls) {
    equity += p;
    peak = Math.max(peak, equity);
    dd = Math.max(dd, peak - equity);
  }
  return roundMoney(dd);
}

export interface EquityPoint {
  index: number;
  tradeId: string;
  date: string;
  pnl: number;
  cumulative: number;
  equity: number;
  drawdown: number; // <= 0
}

export function equitySeries(trades: StatTrade[], startingBalance = 0): EquityPoint[] {
  const closed = chronological(trades.filter((t) => t.status === "closed"));
  let cum = 0, peak = startingBalance;
  return closed.map((t, i) => {
    const pnl = num(t.net_pnl);
    cum = roundMoney(cum + pnl);
    const equity = roundMoney(startingBalance + cum);
    peak = Math.max(peak, equity);
    return { index: i + 1, tradeId: t.id, date: t.trade_date, pnl, cumulative: cum, equity, drawdown: roundMoney(equity - peak) };
  });
}

export type Period = "day" | "week" | "month" | "year";

/** ISO week key (Monday start) for a YYYY-MM-DD date, e.g. 2026-W11. */
export function isoWeekKey(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function periodKey(date: string, period: Period): string {
  switch (period) {
    case "day": return date;
    case "week": return isoWeekKey(date);
    case "month": return date.slice(0, 7);
    case "year": return date.slice(0, 4);
  }
}

export interface PeriodBucket {
  key: string;
  trades: number;
  wins: number;
  losses: number;
  netPnl: number;
}

export function bucketByPeriod(trades: StatTrade[], period: Period): PeriodBucket[] {
  const map = new Map<string, PeriodBucket>();
  for (const t of trades) {
    if (t.status !== "closed") continue;
    const key = periodKey(t.trade_date, period);
    const b = map.get(key) ?? { key, trades: 0, wins: 0, losses: 0, netPnl: 0 };
    const n = num(t.net_pnl);
    b.trades++;
    if (n > 0) b.wins++;
    else if (n < 0) b.losses++;
    b.netPnl = roundMoney(b.netPnl + n);
    map.set(key, b);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Minimum sample before we describe a difference as more than anecdotal. */
export const MIN_SAMPLE = 30;

export function sampleNote(n: number): string | null {
  if (n === 0) return "No closed trades in this selection.";
  if (n < 10) return `Only ${n} closed trade${n === 1 ? "" : "s"} — far too few to draw conclusions.`;
  if (n < MIN_SAMPLE) return `${n} closed trades — small sample; treat results as preliminary.`;
  return null;
}
