"use client";
/**
 * Dashboard charts (Recharts). Colour note: profit/loss green/red is not colour-blind safe on
 * its own, so polarity is ALWAYS also encoded by position (above/below the zero line) and by
 * signed labels in tooltips. Single-series charts carry no legend; the card title names them.
 */
import { useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { EquityPoint, PeriodBucket } from "@/lib/calc/stats";
import { fmtMoney } from "@/lib/format";
import { cx } from "./ui";

const C = {
  accent: "#4cc2d6",
  profit: "#2fbf71",
  loss: "#ef5350",
  grid: "#1f2632",
  axis: "#5b6577",
  text: "#dbe1ea",
  panel: "#151a23",
};

const axisProps = { stroke: C.axis, tick: { fill: C.axis, fontSize: 11 }, tickLine: false, axisLine: { stroke: C.grid } } as const;
const compactUsd = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1000 ? `$${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k` : `$${a.toFixed(0)}`;
  return v < 0 ? `−${s}` : s;
};

function Tip({ active, payload, label, render }: { active?: boolean; payload?: { payload: unknown }[]; label?: string | number; render: (p: never, label?: string | number) => React.ReactNode }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line-strong bg-panel-2 px-2.5 py-1.5 text-xs shadow-lg">
      {render(payload[0].payload as never, label)}
    </div>
  );
}

function Tabs<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-md border border-line p-0.5" role="tablist">
      {options.map(([v, l]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} onClick={() => onChange(v)}
          className={cx("rounded px-2 py-0.5 text-[11px]", value === v ? "bg-panel-2 text-fg" : "text-muted hover:text-fg")}>
          {l}
        </button>
      ))}
    </div>
  );
}

function ChartCard({ title, actions, children, empty }: { title: string; actions?: React.ReactNode; children: React.ReactNode; empty?: boolean }) {
  return (
    <section className="card">
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="text-[12px] font-semibold uppercase tracking-wider text-muted">{title}</h2>
        {actions}
      </header>
      <div className="h-64 px-2 py-3">
        {empty ? <div className="flex h-full items-center justify-center text-sm text-faint">No closed trades in this selection.</div> : children}
      </div>
    </section>
  );
}

export function EquityChart({ points, startingBalance }: { points: EquityPoint[]; startingBalance: number }) {
  const [mode, setMode] = useState<"equity" | "cumulative">("equity");
  const key = mode === "equity" ? "equity" : "cumulative";
  const data = [{ index: 0, date: "start", pnl: 0, cumulative: 0, equity: startingBalance, drawdown: 0, tradeId: "" }, ...points];
  return (
    <ChartCard
      title={mode === "equity" ? "Equity curve" : "Cumulative P/L"}
      empty={!points.length}
      actions={<Tabs value={mode} onChange={setMode} options={[["equity", "Equity"], ["cumulative", "Cumulative P/L"]]} />}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 12, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.accent} stopOpacity={0.25} />
              <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="index" {...axisProps} tickFormatter={(v) => (v === 0 ? "" : `#${v}`)} minTickGap={24} />
          <YAxis {...axisProps} width={64} tickFormatter={compactUsd} domain={["auto", "auto"]} />
          <ReferenceLine y={mode === "equity" ? startingBalance : 0} stroke={C.axis} strokeDasharray="3 3" />
          <Tooltip
            cursor={{ stroke: C.axis, strokeDasharray: "3 3" }}
            content={<Tip render={(p: EquityPoint) => (
              <>
                <div className="text-muted">{p.index === 0 ? "Start" : `Trade #${p.index} · ${p.date}`}</div>
                <div className="num">{mode === "equity" ? "Equity" : "Cumulative"}: {fmtMoney(p[key])}</div>
                {p.index ? <div className="num">Trade: {fmtMoney(p.pnl, "USD", true)}</div> : null}
              </>
            )} />}
          />
          <Area type="linear" dataKey={key} stroke={C.accent} strokeWidth={2} fill="url(#eqFill)" dot={false} activeDot={{ r: 4, stroke: C.panel, strokeWidth: 2 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function DrawdownChart({ points }: { points: EquityPoint[] }) {
  const data = [{ index: 0, drawdown: 0, date: "start" }, ...points];
  return (
    <ChartCard title="Drawdown from peak" empty={!points.length}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="index" {...axisProps} tickFormatter={(v) => (v === 0 ? "" : `#${v}`)} minTickGap={24} />
          <YAxis {...axisProps} width={64} tickFormatter={compactUsd} domain={["auto", 0]} />
          <ReferenceLine y={0} stroke={C.axis} />
          <Tooltip
            cursor={{ stroke: C.axis, strokeDasharray: "3 3" }}
            content={<Tip render={(p: EquityPoint) => (
              <>
                <div className="text-muted">{p.index === 0 ? "Start" : `Trade #${p.index} · ${p.date}`}</div>
                <div className="num">Drawdown: {fmtMoney(p.drawdown)}</div>
              </>
            )} />}
          />
          <Area type="linear" dataKey="drawdown" stroke={C.loss} strokeWidth={2} fill={C.loss} fillOpacity={0.15} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export type PeriodSets = Record<"day" | "week" | "month" | "year", PeriodBucket[]>;

export function PeriodChart({ sets }: { sets: PeriodSets }) {
  const [period, setPeriod] = useState<keyof PeriodSets>("day");
  const data = sets[period];
  const titles = { day: "Daily performance", week: "Weekly performance", month: "Monthly performance", year: "Yearly performance" };
  return (
    <ChartCard
      title={titles[period]}
      empty={!data.length}
      actions={<Tabs value={period} onChange={setPeriod} options={[["day", "Day"], ["week", "Week"], ["month", "Month"], ["year", "Year"]]} />}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 12, left: 4, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="key" {...axisProps} minTickGap={16} />
          <YAxis {...axisProps} width={64} tickFormatter={compactUsd} />
          <ReferenceLine y={0} stroke={C.axis} />
          <Tooltip
            cursor={{ fill: "#ffffff08" }}
            content={<Tip render={(b: PeriodBucket) => (
              <>
                <div className="text-muted">{b.key}</div>
                <div className="num">Net: {fmtMoney(b.netPnl, "USD", true)}</div>
                <div className="num text-muted">{b.trades} trades · {b.wins}W / {b.losses}L</div>
              </>
            )} />}
          />
          <Bar dataKey="netPnl" maxBarSize={28} radius={[3, 3, 3, 3]} isAnimationActive={false}>
            {data.map((b) => <Cell key={b.key} fill={b.netPnl >= 0 ? C.profit : C.loss} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function WinLossChart({ wins, losses, breakeven, grossProfit, grossLoss }: { wins: number; losses: number; breakeven: number; grossProfit: number; grossLoss: number }) {
  const total = wins + losses + breakeven;
  const rows = [
    { label: "Winners", count: wins, amount: grossProfit, color: C.profit },
    { label: "Losers", count: losses, amount: grossLoss, color: C.loss },
    { label: "Breakeven", count: breakeven, amount: 0, color: C.axis },
  ];
  return (
    <section className="card">
      <header className="border-b border-line px-4 py-2.5">
        <h2 className="text-[12px] font-semibold uppercase tracking-wider text-muted">Winning vs. losing trades</h2>
      </header>
      <div className="space-y-4 p-4">
        {total === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-faint">No closed trades in this selection.</div>
        ) : (
          <>
            <div className="flex h-3 gap-0.5 overflow-hidden rounded" role="img" aria-label={`${wins} wins, ${losses} losses, ${breakeven} breakeven`}>
              {rows.filter((r) => r.count).map((r) => (
                <div key={r.label} style={{ width: `${(r.count / total) * 100}%`, background: r.color }} title={`${r.label}: ${r.count}`} />
              ))}
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-[11px] uppercase tracking-wide text-muted"><th className="pb-1 text-left font-medium">Outcome</th><th className="pb-1 text-right font-medium">Trades</th><th className="pb-1 text-right font-medium">Share</th><th className="pb-1 text-right font-medium">Net P/L</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-t border-line/60">
                    <td className="py-1.5"><span className="mr-2 inline-block h-2 w-2 rounded-sm" style={{ background: r.color }} />{r.label}</td>
                    <td className="num py-1.5 text-right">{r.count}</td>
                    <td className="num py-1.5 text-right text-muted">{((r.count / total) * 100).toFixed(1)}%</td>
                    <td className="num py-1.5 text-right">{fmtMoney(r.amount, "USD", true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </section>
  );
}
