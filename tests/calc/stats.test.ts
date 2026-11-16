import { describe, expect, it } from "vitest";
import { bucketByPeriod, equitySeries, isoWeekKey, maxDrawdown, sampleNote, summarize, type StatTrade } from "@/lib/calc/stats";

let n = 0;
const tr = (date: string, net: number, r: number | null = null, fees = 1, status: "open" | "closed" = "closed"): StatTrade => {
  n++;
  return {
    id: `t${String(n).padStart(3, "0")}`, trade_date: date,
    entry_time: `${date}T14:${String(n % 60).padStart(2, "0")}:00Z`, exit_time: status === "closed" ? `${date}T15:${String(n % 60).padStart(2, "0")}:00Z` : null,
    status, net_pnl: net, gross_pnl: net + fees, total_fees: fees, r_multiple: r,
  };
};

describe("summarize", () => {
  const trades = [
    tr("2026-03-02", 100, 2), tr("2026-03-02", -50, -1), tr("2026-03-03", 200, 4),
    tr("2026-03-04", -30, -0.6), tr("2026-03-05", -40, null), tr("2026-03-06", 0, 0),
    tr("2026-03-06", 999, null, 1, "open"),
  ];
  const s = summarize(trades);
  it("counts", () => {
    expect(s).toMatchObject({ totalTrades: 7, closedTrades: 6, openTrades: 1, wins: 2, losses: 3, breakeven: 1 });
    expect(s.winRate).toBeCloseTo(2 / 6);
  });
  it("money figures exclude open trades", () => {
    expect(s).toMatchObject({ grossProfit: 300, grossLoss: -120, netPnl: 180, totalFees: 6, pnlBeforeFees: 186 });
    expect(s).toMatchObject({ avgWin: 150, avgLoss: -40, largestWin: 200, largestLoss: -50, expectancy: 30 });
    expect(s.profitFactor).toBe(2.5);
  });
  it("R and streaks", () => {
    expect(s.avgR).toBe(0.88); // (2 −1 +4 −0.6 +0)/5
    expect(s.rSampleSize).toBe(5);
    expect(s.maxConsecutiveLosses).toBe(2);
    expect(s.maxConsecutiveWins).toBe(1);
  });
  it("drawdown: +100, −50, +200, −30, −40, 0 → peak 250, trough 180 → 70", () => {
    expect(s.maxDrawdown).toBe(70);
  });
  it("empty", () => {
    const e = summarize([]);
    expect(e.winRate).toBeNull();
    expect(e.profitFactor).toBeNull();
    expect(e.maxDrawdown).toBe(0);
  });
});

describe("series", () => {
  it("maxDrawdown from start", () => {
    expect(maxDrawdown([-100, 50, -200, 400])).toBe(250);
  });
  it("equitySeries with starting balance", () => {
    const s = equitySeries([tr("2026-01-05", 100), tr("2026-01-06", -300), tr("2026-01-07", 50)], 50000);
    expect(s.map((p) => p.equity)).toEqual([50100, 49800, 49850]);
    expect(s.map((p) => p.drawdown)).toEqual([0, -300, -250]);
  });
  it("ISO weeks", () => {
    expect(isoWeekKey("2026-01-01")).toBe("2026-W01"); // Thursday
    expect(isoWeekKey("2027-01-01")).toBe("2026-W53"); // Friday belongs to prior ISO year
    expect(isoWeekKey("2026-03-09")).toBe("2026-W11");
  });
  it("buckets", () => {
    const b = bucketByPeriod([tr("2026-03-02", 10), tr("2026-03-03", -5), tr("2026-04-01", 7)], "month");
    expect(b).toEqual([
      { key: "2026-03", trades: 2, wins: 1, losses: 1, netPnl: 5 },
      { key: "2026-04", trades: 1, wins: 1, losses: 0, netPnl: 7 },
    ]);
  });
  it("sample notes", () => {
    expect(sampleNote(0)).toMatch(/No closed/);
    expect(sampleNote(5)).toMatch(/far too few/);
    expect(sampleNote(20)).toMatch(/preliminary/);
    expect(sampleNote(30)).toBeNull();
  });
});
