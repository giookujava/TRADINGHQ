import { describe, expect, it } from "vitest";
import { accountFinance, signedAmount } from "@/lib/calc/finance";
import type { StatTrade } from "@/lib/calc/stats";

let n = 0;
const t = (date: string, net: number): StatTrade => {
  n++;
  return { id: `t${n}`, trade_date: date, entry_time: `${date}T14:${String(n).padStart(2, "0")}:00Z`, exit_time: `${date}T15:${String(n).padStart(2, "0")}:00Z`, status: "closed", net_pnl: net, gross_pnl: net, total_fees: 0, r_multiple: null };
};

describe("cash flows", () => {
  it("signs amounts by kind", () => {
    expect([signedAmount("deposit", 100), signedAmount("withdrawal", 100), signedAmount("payout", 50), signedAmount("platform_fee", 10), signedAmount("adjustment", -7)])
      .toEqual([100, -100, -50, -10, -7]);
  });
  it("deposits and withdrawals change the balance but never trading P/L", () => {
    const f = accountFinance(1000, [t("2026-03-02", 200), t("2026-03-03", -50)],
      [{ kind: "deposit", amount: 500, occurred_on: "2026-03-01" }, { kind: "withdrawal", amount: 300, occurred_on: "2026-03-05" }, { kind: "data_fee", amount: 15, occurred_on: "2026-03-05" }],
      "2026-03-05");
    expect(f).toMatchObject({ tradingNet: 150, deposits: 500, withdrawals: 300, feesExpenses: 15, balance: 1335, tradingEquity: 1150 });
    expect(f.prop).toBeNull();
  });
});

describe("prop rules", () => {
  const trades = [t("2026-03-02", 1000), t("2026-03-03", 500), t("2026-03-04", -900), t("2026-03-05", -300)];
  const base = { account_size: 50000, profit_target: 3000, daily_loss_limit: 1000, max_drawdown: 2000 };
  it("static drawdown floor from starting balance; target progress on trading P/L", () => {
    const f = accountFinance(50000, trades, [], "2026-03-05", { ...base, drawdown_type: "static" });
    expect(f.prop).toMatchObject({ targetProgress: 300 / 3000, targetRemaining: 2700, drawdownFloor: 48000, drawdownRemaining: 2300, dailyLossUsed: 300, dailyLossRemaining: 700, breached: false });
  });
  it("trailing drawdown follows the realised equity peak", () => {
    const f = accountFinance(50000, trades, [], "2026-03-05", { ...base, drawdown_type: "trailing" });
    expect(f.peakTradingEquity).toBe(51500);
    expect(f.prop).toMatchObject({ drawdownFloor: 49500, drawdownRemaining: 800, breached: false });
    const worse = accountFinance(50000, [...trades, t("2026-03-06", -900)], [], "2026-03-06", { ...base, drawdown_type: "trailing" });
    expect(worse.prop).toMatchObject({ drawdownRemaining: -100, breached: true });
  });
  it("daily loss limit breach", () => {
    const f = accountFinance(50000, [t("2026-03-06", -1000)], [], "2026-03-06", { ...base, drawdown_type: "static" });
    expect(f.prop?.breached).toBe(true);
    expect(f.prop?.dailyLossRemaining).toBe(0);
  });
});
