import { CalendarArrowDown, CalendarArrowUp, ChartColumn, Gauge, TrendingDown, Waves } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { Card, Empty, PageHeader, StatCard, cx } from "@/components/ui";
import {
  bestWorstDays, compare, DIMENSIONS, drawdownStats, groupBy, lastVsPrevious, matches, mistakes, type AnalyticsTrade, type Comparison, type GroupRow,
} from "@/lib/calc/analytics";
import { summarize } from "@/lib/calc/stats";
import { getAnalyticsTrades } from "@/lib/data/analytics";
import { DIMENSION_IDS, dimensionLabel, sortValues, valueLabel, type LabelCtx } from "@/lib/data/dimensions";
import { parseFilters } from "@/lib/data/filters";
import { getProfile, getRefData } from "@/lib/data/queries";
import { fmtMoney, fmtNum, fmtPct, fmtR } from "@/lib/format";
import { fmt, type Dict } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/supabase/server";
import { todayInZone } from "@/lib/time/zone";
import { BreakdownExplorer, CompareControls, type DimOptions, type ExplorerDim } from "./explorer";

export const metadata = { title: "Analytics" };

const DIM_RE = /^[a-zA-Z_]+:[\w-]+$/;

function CompareTable({ c, labels, t }: { c: Comparison; labels: [string, string]; t: Dict }) {
  const A = t.analytics;
  const rows: [string, (r: GroupRow) => React.ReactNode, (r: GroupRow) => number | null][] = [
    ["n", (r) => r.n, (r) => r.n],
    [t.dashboard.netPnl, (r) => fmtMoney(r.netPnl, "USD", true), (r) => r.netPnl],
    [t.dashboard.winRate, (r) => fmtPct(r.winRate), (r) => r.winRate],
    [t.dashboard.avgR, (r) => fmtR(r.avgR), (r) => r.avgR],
    [t.dashboard.expectancy, (r) => fmtMoney(r.expectancy, "USD", true), (r) => r.expectancy],
    [t.dashboard.profitFactor, (r) => (r.profitFactor == null ? "—" : fmtNum(r.profitFactor)), (r) => r.profitFactor],
    [t.dashboard.avgWin, (r) => fmtMoney(r.avgWin), (r) => r.avgWin],
    [t.dashboard.avgLoss, (r) => fmtMoney(r.avgLoss), (r) => r.avgLoss],
  ];
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th>{A.metric}</th><th className="text-right">A · {labels[0]}</th><th className="text-right">B · {labels[1]}</th></tr></thead>
          <tbody>
            {rows.map(([name, show, val]) => {
              const a = val(c.a), b = val(c.b);
              const better = a != null && b != null && name !== "n" ? (name === t.dashboard.avgLoss ? (a > b ? "a" : a < b ? "b" : null) : a > b ? "a" : a < b ? "b" : null) : null;
              return (
                <tr key={name}>
                  <td className="text-muted">{name}</td>
                  <td className={cx("num text-right", better === "a" && "font-bold text-accent")}>{show(c.a)}</td>
                  <td className={cx("num text-right", better === "b" && "font-bold text-accent")}>{show(c.b)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={cx("mt-3 rounded-xl px-3.5 py-2.5 text-xs", c.enoughData ? "bg-surface-2 text-muted" : "bg-warn-soft text-warn")}>
        {c.enoughData ? A.compareOk : fmt(A.compareLow, { a: c.a.n, b: c.b.n, m: 10 })}
      </p>
    </div>
  );
}

export default async function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const { supabase, userId } = await requireUser();
  const [t, profile, ref, trades] = await Promise.all([getT(), getProfile(supabase, userId), getRefData(supabase), getAnalyticsTrades(supabase, filters)]);
  const A = t.analytics;
  const ctx: LabelCtx = {
    t,
    instruments: new Map(ref.instruments.map((i) => [i.id, i.symbol])),
    strategies: new Map(ref.strategies.map((s) => [s.id, s.name])),
    accounts: new Map(ref.accounts.map((a) => [a.id, a.name])),
    tags: new Map(ref.tags.map((g) => [g.id, g.name])),
  };
  const closed = trades.filter((x) => x.status === "closed");
  const s = summarize(trades);
  const dd = drawdownStats(trades);
  const days = bestWorstDays(trades);

  // Breakdowns for every dimension (labels resolved here so the client gets plain data).
  const explorer: ExplorerDim[] = DIMENSION_IDS.map((id) => {
    const rows = groupBy(trades, DIMENSIONS[id]);
    const ordered = ["duration", "weekday"].includes(id) ? sortValues(id, rows.map((r) => r.key)).map((k) => rows.find((r) => r.key === k)!) : rows;
    return { id, label: dimensionLabel(id, t), rows: ordered.map((r) => ({ ...r, label: valueLabel(id, r.key, ctx) })) };
  }).filter((d) => d.rows.length);

  const dimOptions: DimOptions[] = explorer.map((d) => ({ id: d.id, label: d.label, values: d.rows.map((r) => ({ key: r.key, label: r.label })) }));

  // Comparison: custom A/B, else preset (default last 30 vs previous 30).
  const a = typeof sp.a === "string" && DIM_RE.test(sp.a) ? sp.a : undefined;
  const b = typeof sp.b === "string" && DIM_RE.test(sp.b) ? sp.b : undefined;
  const preset = typeof sp.cmp === "string" ? sp.cmp : "last30";
  const pick = (spec: string) => { const [d, v] = [spec.split(":")[0], spec.split(":").slice(1).join(":")]; return { list: trades.filter((x) => matches(x, d, v)), label: `${dimensionLabel(d, t)}: ${valueLabel(d, v, ctx)}` }; };
  const presets: { id: string; label: string; run: () => { c: Comparison; labels: [string, string] } }[] = [
    { id: "last30", label: A.presets.last30, run: () => ({ c: lastVsPrevious(trades, 30), labels: [A.presets.last30a, A.presets.last30b] }) },
    { id: "last10", label: A.presets.last10, run: () => ({ c: lastVsPrevious(trades, 10), labels: [A.presets.last10a, A.presets.last10b] }) },
    { id: "rules", label: A.presets.rules, run: () => ({ c: compare(trades.filter((x) => x.flags.followed_rules === true), trades.filter((x) => x.flags.followed_rules === false)), labels: [t.common.yes, t.common.no] }) },
    { id: "planned", label: A.presets.planned, run: () => ({ c: compare(trades.filter((x) => x.flags.was_planned === true), trades.filter((x) => x.flags.was_planned === false)), labels: [t.common.yes, t.common.no] }) },
    { id: "direction", label: A.presets.direction, run: () => ({ c: compare(trades.filter((x) => x.direction === "long"), trades.filter((x) => x.direction === "short")), labels: [t.common.long, t.common.short] }) },
    { id: "nyLondon", label: A.presets.nyLondon, run: () => ({ c: compare(trades.filter((x) => x.session === "ny_am"), trades.filter((x) => x.session === "london")), labels: [t.labels.sessions.ny_am, t.labels.sessions.london] }) },
  ];
  let cmp: { c: Comparison; labels: [string, string] };
  if (a && b) {
    const pa = pick(a), pb = pick(b);
    cmp = { c: compare(pa.list, pb.list), labels: [pa.label, pb.label] };
  } else {
    cmp = (presets.find((p) => p.id === preset) ?? presets[0]).run();
  }

  const mistakeTagIds = ref.tags.filter((g) => g.category === "mistake").map((g) => g.id);
  const mistakeRows = mistakes(trades as AnalyticsTrade[], mistakeTagIds);
  const mistakeLabel = (k: string) => (k === "followed_rules_no" ? A.brokeRules : (t.labels.psych as Record<string, string>)[k] ?? ctx.tags.get(k) ?? k);

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader title={A.title} subtitle={A.subtitle} />
      <FilterBar filters={filters} today={todayInZone(profile.trading_timezone)} showStatus
        accounts={ref.accounts.filter((x) => filters.sample || !x.is_sample).map((x) => ({ id: x.id, label: x.name }))}
        instruments={ref.instruments.map((i) => ({ id: i.id, label: i.symbol }))}
        strategies={ref.strategies.map((x) => ({ id: x.id, label: x.name }))} />

      {closed.length === 0 ? (
        <Empty icon={<ChartColumn className="h-5 w-5" />} title={A.emptyTitle}>{A.emptyHint}</Empty>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <StatCard highlight icon={<Gauge className="h-4 w-4" />} label={t.dashboard.expectancy} value={fmtMoney(s.expectancy, "USD", true)}
              aside={fmt(A.perClosed, { n: s.closedTrades })} tone={s.expectancy && s.expectancy > 0 ? "profit" : s.expectancy && s.expectancy < 0 ? "loss" : null} />
            <StatCard icon={<TrendingDown className="h-4 w-4" />} label={t.dashboard.maxDd} value={fmtMoney(-dd.maxDrawdown)} tone={dd.maxDrawdown ? "loss" : null}
              hint={fmt(A.currentDd, { v: fmtMoney(-dd.currentDrawdown) })} />
            <StatCard icon={<Waves className="h-4 w-4" />} label={A.underwater} value={dd.longestUnderwater} aside={A.tradesWord}
              hint={fmt(A.currentUnderwater, { n: dd.currentUnderwater })} />
            <StatCard icon={<CalendarArrowUp className="h-4 w-4" />} label={A.bestDay} value={days.best ? fmtMoney(days.best.netPnl, "USD", true) : "—"} tone="profit" hint={days.best?.key} />
            <StatCard icon={<CalendarArrowDown className="h-4 w-4" />} label={A.worstDay} value={days.worst ? fmtMoney(days.worst.netPnl, "USD", true) : "—"} tone={days.worst && days.worst.netPnl < 0 ? "loss" : null} hint={days.worst?.key} />
            <StatCard icon={<ChartColumn className="h-4 w-4" />} label={A.greenDays} value={days.days ? fmtPct(days.greenDays / days.days, 0) : "—"}
              aside={`${days.greenDays}/${days.days}`} progress={days.days ? days.greenDays / days.days : null}
              hint={`${t.dashboard.streak}: ${s.maxConsecutiveWins} / ${s.maxConsecutiveLosses}`} />
          </div>

          <Card title={A.compareTitle} subtitle={A.compareHint}>
            <CompareControls dims={dimOptions} presets={presets.map(({ id, label }) => ({ id, label }))} current={{ preset: a && b ? undefined : preset, a, b }} />
            <div className="mt-5"><CompareTable c={cmp.c} labels={cmp.labels} t={t} /></div>
          </Card>

          <BreakdownExplorer dims={explorer} />

          <Card title={A.mistakesTitle} subtitle={A.mistakesHint} flush>
            {mistakeRows.length ? (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead><tr><th>{A.mistake}</th><th className="text-right">{A.count}</th><th className="text-right">{A.shareOfTrades}</th><th className="text-right">{t.dashboard.netPnl}</th><th className="text-right">{t.dashboard.avgR}</th></tr></thead>
                  <tbody>
                    {mistakeRows.map((m) => (
                      <tr key={m.key}>
                        <td className="font-semibold">{mistakeLabel(m.key)}{m.kind === "tag" ? <span className="ml-2 text-xs text-faint">#{A.tagWord}</span> : null}</td>
                        <td className="num text-right">{m.count}</td>
                        <td className="num text-right">{fmtPct(m.share, 0)}</td>
                        <td className={cx("num text-right font-semibold", m.netPnl > 0 && "text-profit", m.netPnl < 0 && "text-loss")}>{fmtMoney(m.netPnl, "USD", true)}</td>
                        <td className="num text-right">{fmtR(m.avgR)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="px-5 pb-5 text-sm text-faint">{A.noMistakes}</p>}
          </Card>
        </div>
      )}
    </div>
  );
}
