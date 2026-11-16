import { describe, expect, it } from "vitest";
import { calculateTrade } from "@/lib/calc/trade";
import { generateSampleTrades } from "@/lib/sample/generate";
import { toCsv } from "@/lib/export/csv";
import { parseFilters } from "@/lib/data/filters";

describe("sample data", () => {
  it("is deterministic and every trade is valid and closed", () => {
    const a = generateSampleTrades("2026-11-16");
    expect(a).toEqual(generateSampleTrades("2026-11-16"));
    expect(a).toHaveLength(40);
    for (const s of a) {
      const r = calculateTrade({
        instrument: { pointValue: s.symbol === "MNQ" ? 2 : 5 },
        executions: s.executions.map((e) => ({ executedAt: e.executed_at, side: e.side, quantity: e.quantity, price: e.price, fees: 0 })),
        stopLoss: s.stop_loss,
      });
      expect(r.status).toBe("closed");
      expect(r.direction).toBe(s.direction);
      expect(new Date(s.trade_date).getUTCDay()).not.toBe(0);
    }
  });
});

describe("csv", () => {
  it("quotes and neutralises formula injection in text only", () => {
    expect(toCsv(["a", "b", "c"], [["=SUM(A1)", -5, 'x,"y"']])).toBe('a,b,c\r\n\'=SUM(A1),-5,"x,""y"""\r\n');
  });
});

describe("filters", () => {
  it("whitelists params", () => {
    const f = parseFilters({ from: "2026-01-01", to: "bad", account: "not-a-uuid", direction: "long", session: "ny", type: "hack", sample: "1" });
    expect(f).toEqual({ from: "2026-01-01", direction: "long", session: "ny", sample: true });
  });
});
