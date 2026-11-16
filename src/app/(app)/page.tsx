import { ArrowRight, BookOpen, ChartLine, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { DrawdownChart, EquityChart, PeriodChart, WinLossChart } from "@/components/charts";
import { FilterBar } from "@/components/filter-bar";
import { TradeTable } from "@/components/trade-table";
import { Card, Empty, Metric, PageHeader, StatRow, cx } from "@/components/ui";
import { SESSION_LABELS } from "@/lib/constants";
import { bucketByPeriod, equitySeries, sampleNote, summarize, MIN_SAMPLE } from "@/lib/calc/stats";
import { roundMoney, sum } from "@/lib/calc/money";
import { hasActiveFilters, parseFilters } from "@/lib/data/filters";
import { getProfile, getRefData, getTrades, type TradeListRow } from "@/lib/data/queries";
import { fmtMoney, fmtNum, fmtPct, fmtR, pnlTone } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { todayInZone } from "@/lib/time/zone";

export const metadata = { title: "Dashboard" };

function Breakdown({ title, rows }: { title: string; rows: { key: string; label: string; trades: TradeListRow[] }[] }) {
  const data = rows
    .map((r) => ({ ...r, s: summarize(r.trades) }))
    .filter((r) => r.s.closedTrades > 0)
    .sort((a, b) => b.s.netPnl - a.s.netPnl);
  const max = Math.max(1, ...data.map((r) => Math.abs(r.s.netPnl)));
  return (
    <div>
      <div className="eyebrow mb-2">{title}</div>
      {data.length ? (
        <ul className="space-y-2.5">
          {data.map((r) => (
            <li key={r.key} className="text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">{r.label}</span>
                <span className={cx("num", r.s.netPnl > 0 && "text-profit", r.s.netPnl < 0 && "text-loss")}>{fmtMoney(r.s.netPnl, "USD", true)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <div className={cx("h-full rounded-full", r.s.netPnl >= 0 ? "bg-profit" : "bg-loss")} style={{ width: `${(Math.abs(r.s.netPnl) / max) * 100}%` }} />
                </div>
                <span className="num w-28 shrink-0 text-right text-[11px] text-faint">n={r.s.closedTrades} · {fmtPct(r.s.winRate, 0)} win</span>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-faint">No closed trades.</p>}
    </div>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const filters = parseFilters(await searchParams);
  const { supabase, userId } = await requireUser();
  const [profile, ref, trades] = await Promise.all([getProfile(supabase, userId), getRefData(supabase), getTrades(supabase, filters)]);
  const cur = profile.currency;
  const today = todayInZone(profile.trading_timezone);

  // Balance is all-time for the selected account(s), independent of date/instrument/etc. filters.
  const balanceAccounts = ref.accounts.filter((a) => (filters.account ? a.id === filters.account : filters.sample || !a.is_sample));
  const allTimeTrades = hasActiveFilters({ ...filters, account: undefined })
    ? await getTrades(supabase, { sample: filters.sample, account: filters.account })
    : trades;
  const ids = new Set(balanceAccounts.map((a) => a.id));
  const startingBalance = roundMoney(sum(balanceAccounts.map((a) => Number(a.starting_balance))));
  const realized = roundMoney(sum(allTimeTrades.filter((t) => ids.has(t.account_id)).map((t) => Number(t.net_pnl ?? 0))));
  const balance = roundMoney(startingBalance + realized);
  const openCount = allTimeTrades.filter((t) => t.status === "open" && ids.has(t.account_id)).length;

  const s = summarize(trades);
  const singleAccount = Boolean(filters.account);
  const points = equitySeries(trades, singleAccount ? startingBalance : 0);
  const note = sampleNote(s.closedTrades);
  const sets = {
    day: bucketByPeriod(trades, "day"),
    week: bucketByPeriod(trades, "week"),
    month: bucketByPeriod(trades, "month"),
    year: bucketByPeriod(trades, "year"),
  };
  const noData = trades.length === 0 && !hasActiveFilters(filters);
  const accountName = filters.account ? ref.accounts.find((a) => a.id === filters.account)?.name : null;
  const sym = new Map(ref.instruments.map((i) => [i.id, i.symbol]));
  const winBar = s.closedTrades ? (s.wins / s.closedTrades) * 100 : 0;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        eyebrow="Overview"
        title="Performance dashboard"
        subtitle={<>{accountName ?? `All ${filters.sample ? "" : "real "}accounts`} · {filters.from || filters.to ? `${filters.from ?? "start"} → ${filters.to ?? "today"}` : "all time"}{filters.sample ? " · including sample data" : ""}</>}
      />
      <FilterBar
        filters={filters}
        today={today}
        accounts={ref.accounts.filter((a) => filters.sample || !a.is_sample).map((a) => ({ id: a.id, label: a.name }))}
        instruments={ref.instruments.map((i) => ({ id: i.id, label: i.symbol }))}
        strategies={ref.strategies.map((x) => ({ id: x.id, label: x.name }))}
      />

      {noData ? (
        <Empty
          icon={<ChartLine className="h-5 w-5" />}
          title="Your dashboard fills up as you journal"
          action={ref.accounts.length === 0
            ? <Link href="/settings/accounts" className="btn btn-primary">Create an account</Link>
            : <Link href="/journal/new" className="btn btn-primary">Record a trade</Link>}
        >
          {ref.accounts.length === 0
            ? <>Start by creating a trading account (e.g. “Backtesting”). To explore first, generate removable sample data in <Link href="/settings/data" className="text-accent underline">Settings → Data</Link>.</>
            : "Every figure here is calculated from your real trade records — nothing is estimated."}
        </Empty>
      ) : (
        <div className="space-y-4">
          {note ? (
            <div className="flex items-center gap-2 rounded-lg bg-warn-soft px-3.5 py-2 text-sm">
              <TriangleAlert className="h-4 w-4 shrink-0 text-warn" aria-hidden /> {note}
              {s.closedTrades < MIN_SAMPLE ? <span className="text-muted">Patterns need ~{MIN_SAMPLE}+ trades.</span> : null}
            </div>
          ) : null}

          {/* Headline summary */}
          <section className="card grid overflow-hidden 2xl:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]">
            <div className="border-b border-line p-6 2xl:border-r 2xl:border-b-0">
              <div className="text-xs font-medium text-muted">Net P/L</div>
              <div className={cx("num mt-2 text-[40px] font-semibold leading-none tracking-tight", s.netPnl > 0 && "text-profit", s.netPnl < 0 && "text-loss")}>
                {fmtMoney(s.netPnl, cur, true)}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>Before fees <span className="num text-fg">{fmtMoney(s.pnlBeforeFees, cur)}</span></span>
                <span>Fees <span className="num text-fg">{fmtMoney(s.totalFees, cur)}</span></span>
                <span>Expectancy <span className="num text-fg">{fmtMoney(s.expectancy, cur, true)}</span>/trade</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 p-6 sm:grid-cols-3 lg:grid-cols-5">
              <Metric label="Account balance" value={fmtMoney(balance, cur)}
                hint={`${balanceAccounts.length} acct · start ${fmtMoney(startingBalance, cur)}`} />
              <div className="min-w-0">
                <Metric label="Win rate" value={fmtPct(s.winRate)} hint={`${s.wins}W · ${s.losses}L · ${s.breakeven}BE`} />
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-loss/25" aria-hidden><div className="h-full rounded-full bg-profit" style={{ width: `${winBar}%` }} /></div>
              </div>
              <Metric label="Profit factor" value={s.profitFactor == null ? "—" : fmtNum(s.profitFactor)} hint={s.losses ? "gross profit ÷ |gross loss|" : "no losses yet"} />
              <Metric label="Total trades" value={s.totalTrades} hint={`${s.closedTrades} closed · ${s.openTrades} open`} />
              <Metric label="Average R" value={fmtR(s.avgR)} tone={pnlTone(s.avgR)} hint={`${s.rSampleSize} with planned risk`} />
            </div>
          </section>

          {/* Equity + secondary statistics */}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <EquityChart points={points} startingBalance={singleAccount ? startingBalance : 0} singleAccount={singleAccount} />
            <Card title="Key statistics" subtitle="Closed trades in the current selection">
              <dl className="-my-1 divide-y divide-line">
                <StatRow label="Gross profit" value={fmtMoney(s.grossProfit, cur)} tone={s.grossProfit ? "profit" : null} />
                <StatRow label="Gross loss" value={fmtMoney(s.grossLoss, cur)} tone={s.grossLoss ? "loss" : null} />
                <StatRow label="Average winner" value={fmtMoney(s.avgWin, cur)} />
                <StatRow label="Average loser" value={fmtMoney(s.avgLoss, cur)} />
                <StatRow label="Largest win" value={fmtMoney(s.largestWin, cur)} />
                <StatRow label="Largest loss" value={fmtMoney(s.largestLoss, cur)} />
                <StatRow label="Max drawdown" value={fmtMoney(-s.maxDrawdown, cur)} tone={s.maxDrawdown ? "loss" : null} />
                <StatRow label="Win / loss streak" value={`${s.maxConsecutiveWins} / ${s.maxConsecutiveLosses}`} />
                <StatRow label="Commissions & fees" value={fmtMoney(s.totalFees, cur)} />
                <StatRow label="Equity" value={fmtMoney(balance, cur)} hint={openCount ? `${openCount} open — unrealized P/L needs live prices` : "no open positions"} />
              </dl>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <PeriodChart sets={sets} />
            <WinLossChart wins={s.wins} losses={s.losses} breakeven={s.breakeven} grossProfit={s.grossProfit} grossLoss={s.grossLoss} avgWin={s.avgWin} avgLoss={s.avgLoss} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <DrawdownChart points={points} />
            <Card title="Performance breakdown" subtitle="Net P/L by group — sample sizes shown; small groups are not conclusive">
              <div className="grid gap-6 sm:grid-cols-2">
                <Breakdown title="Instrument" rows={ref.instruments.map((i) => ({ key: i.id, label: i.symbol, trades: trades.filter((t) => t.instrument_id === i.id) }))} />
                <Breakdown title="Session" rows={[...Object.entries(SESSION_LABELS), ["", "Not set"]].map(([k, label]) => ({ key: k || "none", label, trades: trades.filter((t) => (t.session ?? "") === k) }))} />
              </div>
            </Card>
          </div>

          <Card
            title="Recent trades"
            subtitle={`Latest ${Math.min(8, trades.length)} of ${trades.length} in this selection`}
            actions={<Link href="/journal" className="btn btn-sm btn-ghost text-accent">Open journal <ArrowRight className="h-3.5 w-3.5" /></Link>}
            flush
          >
            {trades.length ? (
              <TradeTable rows={trades.slice(0, 8)} symbols={Object.fromEntries(sym)} accounts={Object.fromEntries(ref.accounts.map((a) => [a.id, a.name]))}
                strategies={Object.fromEntries(ref.strategies.map((x) => [x.id, x.name]))} tz={profile.trading_timezone} compact />
            ) : (
              <div className="px-5 pb-5"><Empty icon={<BookOpen className="h-5 w-5" />} title="No trades match these filters" /></div>
            )}
          </Card>

          <p className="text-xs leading-relaxed text-faint">
            Deposits and withdrawals are never counted as trading P/L (cash-flow tracking arrives with Financial Management, Phase 2).
            Balance is all-time for the selected account(s); every other figure follows the filters.
            {singleAccount ? "" : " Select a single account to plot equity from its starting balance."}
          </p>
        </div>
      )}
    </div>
  );
}
