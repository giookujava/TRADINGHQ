import { describe, expect, it } from "vitest";
import { calculateTrade, defaultExecutionFee, formatDuration, TradeCalcError } from "@/lib/calc/trade";
import { roundMoney } from "@/lib/calc/money";

const MNQ = { pointValue: 2 };
const MES = { pointValue: 5 };
const ES = { pointValue: 50 };
const M2K = { pointValue: 5 };
const MCL = { pointValue: 100 };
const t = (min: number) => new Date(Date.UTC(2026, 2, 9, 14, 30 + min)).toISOString();
const fill = (min: number, side: "buy" | "sell", quantity: number, price: number, fees = 0) => ({
  executedAt: t(min), side, quantity, price, fees,
});

describe("calculateTrade", () => {
  it("spec example: 2 MNQ × 20 points = $80 gross, fees deducted once", () => {
    const fee = defaultExecutionFee(2, { commissionPerSide: 0.5, exchangeFeePerSide: 0.74 }); // 2 × 1.24
    expect(fee).toBe(2.48);
    const r = calculateTrade({
      instrument: MNQ,
      executions: [fill(0, "buy", 2, 18000, fee), fill(15, "sell", 2, 18020, fee)],
    });
    expect(r).toMatchObject({
      direction: "long", status: "closed", grossPnl: 80, totalFees: 4.96, netPnl: 75.04,
      avgEntryPrice: 18000, avgExitPrice: 18020, maxPosition: 2, points: 20, holdingSeconds: 900,
    });
  });

  it("short trade profits when price falls", () => {
    const r = calculateTrade({ instrument: MES, executions: [fill(0, "sell", 3, 5000.25), fill(5, "buy", 3, 4990.75)] });
    expect(r.direction).toBe("short");
    expect(r.grossPnl).toBe(142.5); // 9.5 pts × 3 × $5
    expect(r.points).toBe(9.5);
  });

  it("losing trade is negative", () => {
    const r = calculateTrade({ instrument: ES, executions: [fill(0, "buy", 1, 5000), fill(1, "sell", 1, 4996.5, 4.5)] });
    expect(r.grossPnl).toBe(-175);
    expect(r.netPnl).toBe(-179.5);
  });

  it("partial exits (scale out) with FIFO", () => {
    // buy 3 @100, sell 1 @110, sell 2 @105 on MNQ → (10 + 2×5) × $2 = $40
    const r = calculateTrade({
      instrument: MNQ,
      executions: [fill(0, "buy", 3, 100), fill(5, "sell", 1, 110), fill(9, "sell", 2, 105)],
    });
    expect(r.grossPnl).toBe(40);
    expect(r.avgExitPrice).toBeCloseTo(106.6666667, 6);
    expect(r.totalExitQty).toBe(3);
    expect(r.status).toBe("closed");
  });

  it("multiple entries (scale in) then single exit", () => {
    // buy 1 @100, buy 1 @90, sell 2 @110 → (10 + 20) × $2 = $60; avg entry 95
    const r = calculateTrade({
      instrument: MNQ,
      executions: [fill(0, "buy", 1, 100), fill(2, "buy", 1, 90), fill(9, "sell", 2, 110)],
    });
    expect(r.grossPnl).toBe(60);
    expect(r.avgEntryPrice).toBe(95);
    expect(r.maxPosition).toBe(2);
  });

  it("scale in and out interleaved; FIFO total equals average-price total when flat", () => {
    const execs = [
      fill(0, "buy", 2, 100), fill(1, "sell", 1, 104), fill(2, "buy", 3, 98),
      fill(3, "sell", 2, 101), fill(4, "sell", 2, 103),
    ];
    const r = calculateTrade({ instrument: MNQ, executions: execs });
    const buys = 2 * 100 + 3 * 98, sells = 104 + 2 * 101 + 2 * 103;
    expect(r.grossPnl).toBe(roundMoney((sells - buys) * 2));
    expect(r.maxPosition).toBe(4);
  });

  it("open (partially closed) trade realizes only the closed part", () => {
    const r = calculateTrade({ instrument: MNQ, executions: [fill(0, "buy", 2, 100), fill(1, "sell", 1, 110)] });
    expect(r.status).toBe("open");
    expect(r.openQuantity).toBe(1);
    expect(r.grossPnl).toBe(20);
    expect(r.exitTime).toBeNull();
    expect(r.holdingSeconds).toBeNull();
  });

  it("orders executions by time regardless of input order", () => {
    const r = calculateTrade({ instrument: MNQ, executions: [fill(9, "sell", 1, 110), fill(0, "buy", 1, 100)] });
    expect(r.direction).toBe("long");
    expect(r.grossPnl).toBe(20);
  });

  it("rejects reversals and invalid fills", () => {
    expect(() => calculateTrade({ instrument: MNQ, executions: [fill(0, "buy", 1, 100), fill(1, "sell", 2, 101)] }))
      .toThrow(TradeCalcError);
    expect(() => calculateTrade({ instrument: MNQ, executions: [fill(0, "buy", 1.5, 100)] })).toThrow(TradeCalcError);
    expect(() => calculateTrade({ instrument: MNQ, executions: [fill(0, "buy", 1, 0)] })).toThrow(TradeCalcError);
    expect(() => calculateTrade({ instrument: MNQ, executions: [] })).toThrow(TradeCalcError);
  });

  it("fractional tick instruments round to cents", () => {
    // M2K tick 0.1 ($0.50): 2010.3 − 2000.1 = 10.2 pts × 3 × $5 = $153
    const a = calculateTrade({ instrument: M2K, executions: [fill(0, "buy", 3, 2000.1), fill(1, "sell", 3, 2010.3)] });
    expect(a.grossPnl).toBe(153);
    // MCL tick 0.01 ($1): 0.07 × 2 × $100 = $14
    const b = calculateTrade({ instrument: MCL, executions: [fill(0, "buy", 2, 70.11), fill(1, "sell", 2, 70.18)] });
    expect(b.grossPnl).toBe(14);
  });

  it("planned risk from stop and R multiple from net P/L", () => {
    // long 2 MNQ @18000, stop 17990 → risk 10 × 2 × $2 = $40; net 75.04 → 1.876R
    const r = calculateTrade({
      instrument: MNQ, stopLoss: 17990,
      executions: [fill(0, "buy", 2, 18000, 2.48), fill(15, "sell", 2, 18020, 2.48)],
    });
    expect(r.plannedRisk).toBe(40);
    expect(r.rMultiple).toBe(1.876);
  });

  it("planned risk override wins; adjustment fees counted once", () => {
    const r = calculateTrade({
      instrument: MNQ, stopLoss: 17990, plannedRiskOverride: 100, adjustmentFees: 1,
      executions: [fill(0, "buy", 1, 18000, 1), fill(1, "sell", 1, 17990, 1)],
    });
    expect(r.totalFees).toBe(3);
    expect(r.netPnl).toBe(-23);
    expect(r.plannedRisk).toBe(100);
    expect(r.rMultiple).toBe(-0.23);
  });

  it("no stop → no R", () => {
    const r = calculateTrade({ instrument: MNQ, executions: [fill(0, "buy", 1, 1), fill(1, "sell", 1, 2)] });
    expect(r.plannedRisk).toBeNull();
    expect(r.rMultiple).toBeNull();
  });
});

describe("helpers", () => {
  it("roundMoney handles float noise and negatives", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(Object.is(roundMoney(-0.001), 0)).toBe(true);
  });
  it("formatDuration", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(900)).toBe("15m 0s");
    expect(formatDuration(3 * 3600 + 120)).toBe("3h 2m");
    expect(formatDuration(null)).toBe("—");
  });
});
