/**
 * Account finance. Cash flows (deposits, withdrawals, payouts, fees) change the BALANCE but are never
 * trading P/L. Prop-firm limits (profit target, daily loss, max drawdown) are evaluated on trading P/L
 * only, which is how evaluation rules are defined.
 */
import { roundMoney, sum } from "./money";
import { chronological, type StatTrade } from "./stats";

export const CASHFLOW_KINDS = ["deposit", "withdrawal", "payout", "platform_fee", "data_fee", "other_expense", "adjustment"] as const;
export type CashflowKind = (typeof CASHFLOW_KINDS)[number];

export interface Cashflow { kind: CashflowKind; amount: number; occurred_on: string }

/** Effect on the balance: deposits add, withdrawals/payouts/fees subtract, adjustments are signed. */
export function signedAmount(kind: CashflowKind, amount: number): number {
  const a = Number(amount);
  if (kind === "deposit" || kind === "adjustment") return a;
  return -Math.abs(a);
}

export interface PropRules {
  account_size: number | null;
  profit_target: number | null;
  daily_loss_limit: number | null;
  max_drawdown: number | null;
  drawdown_type: "static" | "trailing" | "eod_trailing" | null;
}

export interface AccountFinance {
  startingBalance: number;
  tradingNet: number;
  deposits: number;
  withdrawals: number; // withdrawals + payouts (positive number)
  feesExpenses: number; // platform/data/other (positive number)
  adjustments: number; // signed
  balance: number;
  tradingEquity: number; // starting + trading P/L (no cash flows)
  peakTradingEquity: number;
  todayNet: number;
  prop: null | {
    targetProgress: number | null; // 0..1+
    targetRemaining: number | null;
    dailyLossUsed: number | null; // positive loss today
    dailyLossRemaining: number | null;
    drawdownFloor: number | null;
    drawdownRemaining: number | null;
    breached: boolean;
  };
}

export function accountFinance(
  startingBalance: number,
  trades: StatTrade[],
  flows: Cashflow[],
  today: string,
  rules?: PropRules | null,
): AccountFinance {
  const start = Number(startingBalance);
  const tradingNet = roundMoney(sum(trades.map((t) => Number(t.net_pnl ?? 0))));
  const by = (k: CashflowKind[]) => roundMoney(sum(flows.filter((f) => k.includes(f.kind)).map((f) => Math.abs(Number(f.amount)))));
  const deposits = by(["deposit"]);
  const withdrawals = by(["withdrawal", "payout"]);
  const feesExpenses = by(["platform_fee", "data_fee", "other_expense"]);
  const adjustments = roundMoney(sum(flows.filter((f) => f.kind === "adjustment").map((f) => Number(f.amount))));
  const balance = roundMoney(start + tradingNet + sum(flows.map((f) => signedAmount(f.kind, f.amount))));

  // Trading-equity path for drawdown rules (realised P/L, chronological; EOD variant uses day closes).
  const ordered = chronological(trades);
  let eq = start, peak = start;
  const dayClose = new Map<string, number>();
  for (const t of ordered) {
    eq += Number(t.net_pnl ?? 0);
    peak = Math.max(peak, eq);
    dayClose.set(t.trade_date, eq);
  }
  const eodPeak = Math.max(start, ...dayClose.values());
  const tradingEquity = roundMoney(eq);
  const todayNet = roundMoney(sum(trades.filter((t) => t.trade_date === today).map((t) => Number(t.net_pnl ?? 0))));

  let prop: AccountFinance["prop"] = null;
  if (rules && (rules.profit_target || rules.daily_loss_limit || rules.max_drawdown)) {
    const target = rules.profit_target ? Number(rules.profit_target) : null;
    const dll = rules.daily_loss_limit ? Number(rules.daily_loss_limit) : null;
    const mdd = rules.max_drawdown ? Number(rules.max_drawdown) : null;
    let floor: number | null = null;
    if (mdd != null) {
      const base = rules.drawdown_type === "trailing" ? peak : rules.drawdown_type === "eod_trailing" ? eodPeak : start;
      floor = roundMoney(base - mdd);
    }
    const lossToday = todayNet < 0 ? -todayNet : 0;
    prop = {
      targetProgress: target ? tradingNet / target : null,
      targetRemaining: target ? roundMoney(Math.max(0, target - tradingNet)) : null,
      dailyLossUsed: dll != null ? roundMoney(lossToday) : null,
      dailyLossRemaining: dll != null ? roundMoney(dll - lossToday) : null,
      drawdownFloor: floor,
      drawdownRemaining: floor != null ? roundMoney(tradingEquity - floor) : null,
      breached: (floor != null && tradingEquity <= floor) || (dll != null && lossToday >= dll),
    };
  }

  return {
    startingBalance: roundMoney(start), tradingNet, deposits, withdrawals, feesExpenses, adjustments, balance,
    tradingEquity, peakTradingEquity: roundMoney(peak), todayNet, prop,
  };
}
