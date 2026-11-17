import { describe, expect, it } from "vitest";
import {
  bestWorstDays, bestWorstGroup, compare, drawdownStats, durationBucket, groupBy, DIMENSIONS, lastVsPrevious, matches, mistakes,
  type AnalyticsTrade,
} from "@/lib/calc/analytics";

let n = 0;
function tr(p: Partial<AnalyticsTrade> & { net: number }): AnalyticsTrade {
  n++;
  const date = p.trade_date ?? `2026-03-${String((n % 27) + 1).padStart(2, "0")}`;
  return {
    id: `t${String(n).padStart(4, "0")}`, trade_date: date, entry_time: `${date}T14:00:00Z`, exit_time: `${date}T14:${String(n % 60).padStart(2, "0")}:00Z`,
    status: "closed", net_pnl: p.net, gross_pnl: p.net, total_fees: 0, r_multiple: p.r_multiple ?? null,
    account_id: "acc", instrument_id: p.instrument_id ?? "MNQ", strategy_id: p.strategy_id ?? null, direction: p.direction ?? "long",
    session: p.session ?? "ny_am", trade_type: "backtest", daily_bias: p.daily_bias ?? null, holding_seconds: p.holding_seconds ?? 600,
    tag_ids: p.tag_ids ?? [], flags: p.flags ?? {},
  };
}

describe("groupBy", () => {
  it("summarises per group with sample sizes and low-sample flag, best first", () => {
    const rows = groupBy([tr({ net: 100, instrument_id: "MNQ" }), tr({ net: -50, instrument_id: "MNQ" }), tr({ net: 30, instrument_id: "MES" })], DIMENSIONS.instrument);
    expect(rows.map((r) => [r.key, r.n, r.netPnl, r.lowSample])).toEqual([["MNQ", 2, 50, true], ["MES", 1, 30, true]]);
  });
  it("keeps 'not recorded' separate from 'no'", () => {
    const rows = groupBy([tr({ net: 10, flags: { fvg: true } }), tr({ net: -5, flags: { fvg: false } }), tr({ net: 1, flags: {} })], DIMENSIONS.fvg);
    expect(rows.map((r) => r.key).sort()).toEqual(["no", "unrecorded", "yes"]);
  });
  it("multi-valued dimensions (tags) count a trade in each of its tags", () => {
    const rows = groupBy([tr({ net: 10, tag_ids: ["a", "b"] }), tr({ net: 5, tag_ids: ["a"] })], DIMENSIONS.tag);
    expect(rows.find((r) => r.key === "a")?.n).toBe(2);
    expect(rows.find((r) => r.key === "b")?.n).toBe(1);
  });
  it("NY sessions group together", () => {
    const rows = groupBy([tr({ net: 1, session: "ny_am" }), tr({ net: 1, session: "ny_pm" }), tr({ net: 1, session: "london" })], DIMENSIONS.sessionGroup);
    expect(rows.find((r) => r.key === "ny")?.n).toBe(2);
  });
});

describe("comparisons", () => {
  it("last N vs previous N uses chronological order", () => {
    const trades = [...Array(6)].map((_, i) => tr({ net: i < 3 ? -10 : 20, trade_date: `2026-04-0${i + 1}` }));
    const c = lastVsPrevious(trades, 3);
    expect(c.a.netPnl).toBe(60);
    expect(c.b.netPnl).toBe(-30);
    expect(c.diffNet).toBe(90);
    expect(c.enoughData).toBe(false);
  });
  it("compare + matches by dimension value", () => {
    const all = [tr({ net: 50, flags: { followed_rules: true } }), tr({ net: -40, flags: { followed_rules: false } })];
    const c = compare(all.filter((t) => matches(t, "followed_rules", "yes")), all.filter((t) => matches(t, "followed_rules", "no")));
    expect([c.a.netPnl, c.b.netPnl]).toEqual([50, -40]);
  });
});

describe("mistakes, drawdown, days", () => {
  it("counts mistake flags and mistake tags with their P/L", () => {
    const rows = mistakes([tr({ net: -30, flags: { entered_early: true } }), tr({ net: -20, flags: { entered_early: true, followed_rules: false } }), tr({ net: 10, tag_ids: ["fomo"] })], ["fomo"]);
    const early = rows.find((r) => r.key === "entered_early")!;
    expect([early.count, early.netPnl]).toEqual([2, -50]);
    expect(rows.find((r) => r.key === "followed_rules_no")?.count).toBe(1);
    expect(rows.find((r) => r.key === "fomo")?.kind).toBe("tag");
  });
  it("drawdown stats incl. underwater streaks", () => {
    const d = drawdownStats([tr({ net: 100, trade_date: "2026-05-01" }), tr({ net: -30, trade_date: "2026-05-02" }), tr({ net: -20, trade_date: "2026-05-03" }), tr({ net: 10, trade_date: "2026-05-04" })]);
    expect(d).toEqual({ maxDrawdown: 50, currentDrawdown: 40, longestUnderwater: 3, currentUnderwater: 3, peak: 100 });
  });
  it("best/worst day and reliable best group", () => {
    const t = [tr({ net: 50, trade_date: "2026-05-01" }), tr({ net: -70, trade_date: "2026-05-02" }), tr({ net: 5, trade_date: "2026-05-02" })];
    const d = bestWorstDays(t);
    expect([d.best?.key, d.worst?.key, d.days, d.greenDays]).toEqual(["2026-05-01", "2026-05-02", 2, 1]);
    expect(bestWorstGroup(groupBy(t, DIMENSIONS.instrument)).reliable).toBe(false);
  });
  it("duration buckets", () => {
    expect([durationBucket(60), durationBucket(600), durationBucket(1800), durationBucket(7200), durationBucket(20000), durationBucket(null)])
      .toEqual(["lt5m", "5to15m", "15to60m", "1to4h", "gt4h", null]);
  });
});
