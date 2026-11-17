"use client";
/**
 * Dashboard charts (Recharts), theme-aware via CSS custom properties and translated via useT().
 * Colour note: profit/loss green/red is not colour-blind safe on its own, so polarity is ALWAYS also
 * encoded by position (above/below the zero line) and by signed labels in tooltips/tables.
 * Single-series charts carry no legend; the card title names them.
 */
import { useEffect, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { EquityPoint, PeriodBucket } from "@/lib/calc/stats";
import { fmtMoney } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { Segmented } from "./toast";
import { cx } from "./ui";

type Palette = { line: string; profit: string; loss: string; grid: string; axis: string; surface: string; faint: string };

function readPalette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return { line: v("--chart-line"), profit: v("--profit"), loss: v("--loss"), grid: v("--chart-grid"), axis: v("--chart-axis"), surface: v("--surface"), faint: v("--faint") };
}
const FALLBACK: Palette = { line: "#2dd4e8", profit: "#34d07f", loss: "#f45f5f", grid: "#1a2029", axis: "#677283", surface: "#12161d", faint: "#677283" };

/** Current chart palette; re-reads when the theme changes. */
function usePalette(): Palette {
  const [p, setP] = useState<Palette>(FALLBACK);
  useEffect(() => {
    const update = () => setP(readPalette());
    const id = setTimeout(update, 0);
    window.addEventListener("thq-theme-change", update);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    return () => { clearTimeout(id); window.removeEventListener("thq-theme-change", update); mq.removeEventListener("change", update); };
  }, []);
  return p;
}

const compactUsd = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1_000_000 ? `$${(a / 1_000_000).toFixed(1)}M` : a >= 1000 ? `$${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k` : `$${a.toFixed(0)}`;
  return v < 0 ? `−${s}` : s;
};

function useDates() {
  const t = useT();
  const intl = t.meta.intl;
  const shortDate = (d: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
    return new Intl.DateTimeFormat(intl, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  };
  const periodLabel = (key: string) => (/^\d{4}-\d{2}-\d{2}$/.test(key) ? shortDate(key) : /^\d{4}-\d{2}$/.test(key)
    ? new Intl.DateTimeFormat(intl, { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${key}-15T12:00:00Z`))
    : key);
  return { shortDate, periodLabel };
}

function Tip({ active, payload, render }: { active?: boolean; payload?: { payload: unknown }[]; render: (p: never) => React.ReactNode }) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-pop">{render(payload[0].payload as never)}</div>;
}

function ChartCard({ title, subtitle, actions, children, empty, height = "h-64", className }: {
  title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; empty?: boolean; height?: string; className?: string;
}) {
  const t = useT();
  return (
    <section className={cx("card flex flex-col", className)}>
      <header className="flex flex-wrap items-start justify-between gap-2 px-5 pt-5">
        <div>
          <h2 className="text-base font-bold">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
        </div>
        {actions}
      </header>
      <div className={cx("px-2 pt-3 pb-3", height)}>
        {empty ? <div className="flex h-full items-center justify-center text-sm text-faint">{t.charts.noClosed}</div> : children}
      </div>
    </section>
  );
}

const axis = (p: Palette) => ({ stroke: p.grid, tick: { fill: p.axis, fontSize: 11 }, tickLine: false, axisLine: false }) as const;

export function EquityChart({ points, startingBalance, singleAccount }: { points: EquityPoint[]; startingBalance: number; singleAccount: boolean }) {
  const t = useT();
  const { shortDate } = useDates();
  const p = usePalette();
  const [mode, setMode] = useState<"equity" | "cumulative">(singleAccount ? "equity" : "cumulative");
  const key = mode === "equity" ? "equity" : "cumulative";
  const base = mode === "equity" ? startingBalance : 0;
  const data = [{ index: 0, date: points[0]?.date ?? "", pnl: 0, cumulative: 0, equity: startingBalance, drawdown: 0, tradeId: "" }, ...points];
  const stroke = p.line;
  return (
    <ChartCard
      title={mode === "equity" ? t.charts.equity : t.charts.cumulative}
      subtitle={points.length ? fmt(t.charts.closedRange, { n: points.length, a: shortDate(points[0].date), b: shortDate(points[points.length - 1].date) }) : undefined}
      empty={!points.length}
      height="h-80"
      actions={<Segmented label={t.charts.equity} value={mode} onChange={setMode} items={[["equity", t.charts.equityShort], ["cumulative", t.charts.cumulative]]} />}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={p.grid} vertical={false} />
          <XAxis dataKey="index" {...axis(p)} type="number" domain={[0, "dataMax"]} allowDecimals={false}
            tickFormatter={(i: number) => shortDate(data[Math.round(i)]?.date ?? "")} minTickGap={40} />
          <YAxis {...axis(p)} width={62} tickFormatter={compactUsd} domain={["auto", "auto"]} />
          <ReferenceLine y={base} stroke={p.axis} strokeDasharray="3 4" strokeOpacity={0.7} />
          <Tooltip
            cursor={{ stroke: p.axis, strokeDasharray: "3 3" }}
            content={<Tip render={(d: EquityPoint) => (
              <>
                <div className="text-muted">{d.index === 0 ? t.charts.startPt : `${fmt(t.charts.tradeN, { n: d.index })} · ${shortDate(d.date)}`}</div>
                <div className="num mt-0.5 font-semibold">{mode === "equity" ? t.charts.equityShort : t.charts.cumulative} {fmtMoney(d[key])}</div>
                {d.index ? <div className={cx("num", d.pnl > 0 ? "text-profit" : d.pnl < 0 ? "text-loss" : "")}>{t.charts.tradePnl} {fmtMoney(d.pnl, "USD", true)}</div> : null}
              </>
            )} />}
          />
          <Area type="monotone" dataKey={key} stroke={stroke} strokeWidth={2.25} fill="url(#eqFill)" dot={false}
            activeDot={{ r: 4, stroke: p.surface, strokeWidth: 2, fill: stroke }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function DrawdownChart({ points }: { points: EquityPoint[] }) {
  const t = useT();
  const { shortDate } = useDates();
  const p = usePalette();
  const data = [{ index: 0, drawdown: 0, date: points[0]?.date ?? "" }, ...points];
  return (
    <ChartCard title={t.charts.drawdown} subtitle={t.charts.drawdownSub} empty={!points.length} height="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={p.grid} vertical={false} />
          <XAxis dataKey="index" type="number" domain={[0, "dataMax"]} {...axis(p)} allowDecimals={false}
            tickFormatter={(i: number) => shortDate(data[Math.round(i)]?.date ?? "")} minTickGap={40} />
          <YAxis {...axis(p)} width={62} tickFormatter={compactUsd} domain={["auto", 0]} />
          <ReferenceLine y={0} stroke={p.axis} strokeOpacity={0.7} />
          <Tooltip cursor={{ stroke: p.axis, strokeDasharray: "3 3" }}
            content={<Tip render={(d: EquityPoint) => (
              <>
                <div className="text-muted">{d.index === 0 ? t.charts.startPt : `${fmt(t.charts.tradeN, { n: d.index })} · ${shortDate(d.date)}`}</div>
                <div className="num mt-0.5 font-semibold">{fmtMoney(d.drawdown)}</div>
              </>
            )} />} />
          <Area type="linear" dataKey="drawdown" stroke={p.loss} strokeWidth={1.75} fill={p.loss} fillOpacity={0.12} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export type PeriodSets = Record<"day" | "week" | "month" | "year", PeriodBucket[]>;

export function PeriodChart({ sets }: { sets: PeriodSets }) {
  const t = useT();
  const { periodLabel } = useDates();
  const p = usePalette();
  const [period, setPeriod] = useState<keyof PeriodSets>("day");
  const data = sets[period];
  const titles = { day: t.charts.daily, week: t.charts.weekly, month: t.charts.monthly, year: t.charts.yearly };
  const best = data.length ? data.reduce((a, b) => (b.netPnl > a.netPnl ? b : a)) : null;
  const worst = data.length ? data.reduce((a, b) => (b.netPnl < a.netPnl ? b : a)) : null;
  return (
    <ChartCard
      title={titles[period]}
      subtitle={best && worst ? <>{t.charts.best} <span className="num text-fg">{fmtMoney(best.netPnl, "USD", true)}</span> ({periodLabel(best.key)}) · {t.charts.worst} <span className="num text-fg">{fmtMoney(worst.netPnl, "USD", true)}</span> ({periodLabel(worst.key)})</> : undefined}
      empty={!data.length}
      actions={<Segmented label={titles[period]} value={period} onChange={setPeriod} items={[["day", t.charts.day], ["week", t.charts.week], ["month", t.charts.month], ["year", t.charts.year]]} />}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 0 }} barCategoryGap="18%">
          <CartesianGrid stroke={p.grid} vertical={false} />
          <XAxis dataKey="key" {...axis(p)} tickFormatter={periodLabel} minTickGap={16} />
          <YAxis {...axis(p)} width={62} tickFormatter={compactUsd} />
          <ReferenceLine y={0} stroke={p.axis} strokeOpacity={0.7} />
          <Tooltip
            cursor={{ fill: p.grid, opacity: 0.6 }}
            content={<Tip render={(b: PeriodBucket) => (
              <>
                <div className="text-muted">{periodLabel(b.key)} {period === "week" ? `(${b.key})` : ""}</div>
                <div className="num mt-0.5 font-semibold">{fmtMoney(b.netPnl, "USD", true)}</div>
                <div className="num text-muted">{b.trades} {t.common.trades} · {b.wins}W / {b.losses}L</div>
              </>
            )} />}
          />
          <Bar dataKey="netPnl" maxBarSize={26} radius={[5, 5, 5, 5]} isAnimationActive={false}>
            {data.map((b) => <Cell key={b.key} fill={b.netPnl >= 0 ? p.profit : p.loss} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function WinLossChart({ wins, losses, breakeven, grossProfit, grossLoss, avgWin, avgLoss }: {
  wins: number; losses: number; breakeven: number; grossProfit: number; grossLoss: number; avgWin: number | null; avgLoss: number | null;
}) {
  const t = useT();
  const total = wins + losses + breakeven;
  const rows = [
    { label: t.charts.winners, sym: "▲", count: wins, amount: grossProfit, avg: avgWin, cls: "bg-profit", text: "text-profit" },
    { label: t.charts.losers, sym: "▼", count: losses, amount: grossLoss, avg: avgLoss, cls: "bg-loss", text: "text-loss" },
    { label: t.charts.breakeven, sym: "●", count: breakeven, amount: 0, avg: null, cls: "bg-faint", text: "text-faint" },
  ];
  return (
    <section className="card flex flex-col">
      <header className="px-5 pt-5">
        <h2 className="text-base font-bold">{t.charts.winLoss}</h2>
        <p className="mt-0.5 text-xs text-muted">{t.charts.winLossSub}</p>
      </header>
      <div className="flex flex-1 flex-col justify-center gap-5 p-5">
        {total === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-faint">{t.charts.noClosed}</div>
        ) : (
          <>
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${wins} / ${losses} / ${breakeven}`}>
              {rows.filter((r) => r.count).map((r) => (
                <div key={r.label} className={r.cls} style={{ width: `${(r.count / total) * 100}%` }} title={`${r.label}: ${r.count}`} />
              ))}
            </div>
            <dl className="divide-y divide-line">
              {rows.map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <dt className="flex items-center gap-2"><span className={cx("text-[10px]", r.text)} aria-hidden>{r.sym}</span>{r.label}
                    <span className="num text-xs text-faint">{r.count} · {((r.count / total) * 100).toFixed(0)}%</span></dt>
                  <dd className="text-right">
                    <div className="num font-medium">{fmtMoney(r.amount, "USD", true)}</div>
                    {r.avg != null ? <div className="num text-xs text-faint">{t.charts.avg} {fmtMoney(r.avg, "USD", true)}</div> : null}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>
    </section>
  );
}
