import { ArrowRight, BookOpen, ChartLine, Gauge, Percent, Plus, Scale, Sparkles, TriangleAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { DrawdownChart, EquityChart, PeriodChart, WinLossChart } from "@/components/charts";
import { FilterBar } from "@/components/filter-bar";
import { TradeTable } from "@/components/trade-table";
import { Card, Empty, PageHeader, StatCard, StatRow, cx } from "@/components/ui";
import { SESSIONS } from "@/lib/constants";
import { bucketByPeriod, equitySeries, MIN_SAMPLE, summarize } from "@/lib/calc/stats";
import { roundMoney, sum } from "@/lib/calc/money";
import { hasActiveFilters, parseFilters } from "@/lib/data/filters";
import { getProfile, getRefData, getTrades, type TradeListRow } from "@/lib/data/queries";
import { fmtMoney, fmtNum, fmtPct, fmtR, pnlTone } from "@/lib/format";
import { fmt, type Dict } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/supabase/server";
import { todayInZone } from "@/lib/time/zone";

export const metadata = { title: "Dashboard" };

function sampleNoteT(t: Dict, n: number): string | null {
  if (n === 0) return t.charts.noClosed;
  if (n < MIN_SAMPLE) return fmt(t.dashboard.tooFew, { n, m: MIN_SAMPLE });
  return null;
}

function Breakdown({ t, title, rows }: { t: Dict; title: string; rows: { key: string; label: string; trades: TradeListRow[] }[] }) {
  const data = rows
    .map((r) => ({ ...r, s: summarize(r.trades) }))
    .filter((r) => r.s.closedTrades > 0)
    .sort((a, b) => b.s.netPnl - a.s.netPnl);
  const max = Math.max(1, ...data.map((r) => Math.abs(r.s.netPnl)));
  return (
    <div>
      <div className="eyebrow mb-2.5">{title}</div>
      {data.length ? (
        <ul className="space-y-3">
          {data.map((r) => (
            <li key={r.key} className="text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-semibold">{r.label}</span>
                <span className={cx("num", r.s.netPnl > 0 && "text-profit", r.s.netPnl < 0 && "text-loss")}>{fmtMoney(r.s.netPnl, "USD", true)}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <div className={cx("h-full rounded-full", r.s.netPnl >= 0 ? "bg-profit" : "bg-loss")} style={{ width: `${(Math.abs(r.s.netPnl) / max) * 100}%` }} />
                </div>
                <span className="num w-28 shrink-0 text-right text-[11px] text-faint">n={r.s.closedTrades} · {fmtPct(r.s.winRate, 0)} {t.dashboard.win}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-faint">{t.dashboard.noClosed}</p>}
    </div>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const filters = parseFilters(await searchParams);
  const { supabase, userId } = await requireUser();
  const [t, profile, ref, trades] = await Promise.all([getT(), getProfile(supabase, userId), getRefData(supabase), getTrades(supabase, filters)]);
  const cur = profile.currency;
  const today = todayInZone(profile.trading_timezone);

  // Balance is all-time for the selected account(s), independent of date/instrument/etc. filters.
  const balanceAccounts = ref.accounts.filter((a) => (filters.account ? a.id === filters.account : filters.sample || !a.is_sample));
  const allTimeTrades = hasActiveFilters({ ...filters, account: undefined })
    ? await getTrades(supabase, { sample: filters.sample, account: filters.account })
    : trades;
  const ids = new Set(balanceAccounts.map((a) => a.id));
  const startingBalance = roundMoney(sum(balanceAccounts.map((a) => Number(a.starting_balance))));
  const realized = roundMoney(sum(allTimeTrades.filter((x) => ids.has(x.account_id)).map((x) => Number(x.net_pnl ?? 0))));
  const balance = roundMoney(startingBalance + realized);
  const openCount = allTimeTrades.filter((x) => x.status === "open" && ids.has(x.account_id)).length;

  const s = summarize(trades);
  const singleAccount = Boolean(filters.account);
  const points = equitySeries(trades, singleAccount ? startingBalance : 0);
  const note = sampleNoteT(t, s.closedTrades);
  const sets = {
    day: bucketByPeriod(trades, "day"),
    week: bucketByPeriod(trades, "week"),
    month: bucketByPeriod(trades, "month"),
    year: bucketByPeriod(trades, "year"),
  };
  const noData = trades.length === 0 && !hasActiveFilters(filters);
  const accountName = filters.account ? ref.accounts.find((a) => a.id === filters.account)?.name : null;
  const sym = new Map(ref.instruments.map((i) => [i.id, i.symbol]));
  const D = t.dashboard;

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title={D.title}
        subtitle={<>{accountName ?? (filters.sample ? D.allAccounts : D.allReal)} · {filters.from || filters.to ? `${filters.from ?? D.start} → ${filters.to ?? D.now}` : D.allTime}{filters.sample ? ` · ${D.inclSample}` : ""}</>}
        actions={<Link href="/journal/new" className="btn btn-primary h-12 px-6 text-[15px]"><Plus className="h-5 w-5" /> {t.topbar.addTrade}</Link>}
      />

      {noData ? (
        <>
          <FilterBar filters={filters} today={today}
            accounts={ref.accounts.filter((a) => filters.sample || !a.is_sample).map((a) => ({ id: a.id, label: a.name }))}
            instruments={ref.instruments.map((i) => ({ id: i.id, label: i.symbol }))}
            strategies={ref.strategies.map((x) => ({ id: x.id, label: x.name }))} />
          <Empty
            icon={<ChartLine className="h-5 w-5" />}
            title={D.emptyTitle}
            action={ref.accounts.length === 0
              ? <Link href="/settings/accounts" className="btn btn-primary">{D.createAccount}</Link>
              : <Link href="/journal/new" className="btn btn-primary">{D.recordTrade}</Link>}
          >
            {ref.accounts.length === 0
              ? <>{D.emptyNoAccount} <Link href="/settings/data" className="text-accent underline">{D.settingsData}</Link>.</>
              : D.emptyHasAccount}
          </Empty>
        </>
      ) : (
        <div className="space-y-5">
          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            <StatCard highlight icon={<Sparkles className="h-4 w-4" />} label={D.netPnl}
              value={fmtMoney(s.netPnl, cur, true)} tone={pnlTone(s.netPnl)}
              ring={s.winRate} hint={<>{fmt(D.winsOfClosed, { w: s.wins, c: s.closedTrades })} · {D.beforeFees} <span className="num">{fmtMoney(s.pnlBeforeFees, cur)}</span></>}
              className="sm:col-span-2 lg:col-span-1" />
            <StatCard icon={<Wallet className="h-4 w-4" />} label={D.balance} value={fmtMoney(balance, cur)}
              hint={`${balanceAccounts.length} ${D.acct} · ${D.start} ${fmtMoney(startingBalance, cur)}`} />
            <StatCard icon={<Percent className="h-4 w-4" />} label={D.winRate} value={fmtPct(s.winRate)}
              aside={`${s.wins}W · ${s.losses}L`} progress={s.winRate ?? 0} />
            <StatCard icon={<Scale className="h-4 w-4" />} label={D.profitFactor} value={s.profitFactor == null ? "—" : fmtNum(s.profitFactor)}
              aside={fmt(D.closedOpen, { c: s.closedTrades, o: s.openTrades })} hint={s.losses ? D.pfHint : D.noLosses} />
            <StatCard icon={<Gauge className="h-4 w-4" />} label={D.avgR} value={fmtR(s.avgR)} tone={pnlTone(s.avgR)}
              aside={fmt(D.withRisk, { n: s.rSampleSize })} hint={`${D.expectancy} ${fmtMoney(s.expectancy, cur, true)}${D.perTrade}`} />
          </div>

          <FilterBar filters={filters} today={today}
            accounts={ref.accounts.filter((a) => filters.sample || !a.is_sample).map((a) => ({ id: a.id, label: a.name }))}
            instruments={ref.instruments.map((i) => ({ id: i.id, label: i.symbol }))}
            strategies={ref.strategies.map((x) => ({ id: x.id, label: x.name }))} />

          {note ? (
            <div className="flex items-center gap-2 rounded-2xl bg-warn-soft px-4 py-2.5 text-sm">
              <TriangleAlert className="h-4 w-4 shrink-0 text-warn" aria-hidden /> {note}
            </div>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <EquityChart points={points} startingBalance={singleAccount ? startingBalance : 0} singleAccount={singleAccount} />
            <Card title={D.keyStats} subtitle={D.keyStatsSub}>
              <dl className="-my-1 divide-y divide-line">
                <StatRow label={D.totalTrades} value={s.totalTrades} hint={fmt(D.closedOpen, { c: s.closedTrades, o: s.openTrades })} />
                <StatRow label={D.grossProfit} value={fmtMoney(s.grossProfit, cur)} tone={s.grossProfit ? "profit" : null} />
                <StatRow label={D.grossLoss} value={fmtMoney(s.grossLoss, cur)} tone={s.grossLoss ? "loss" : null} />
                <StatRow label={D.avgWin} value={fmtMoney(s.avgWin, cur)} />
                <StatRow label={D.avgLoss} value={fmtMoney(s.avgLoss, cur)} />
                <StatRow label={D.largestWin} value={fmtMoney(s.largestWin, cur)} />
                <StatRow label={D.largestLoss} value={fmtMoney(s.largestLoss, cur)} />
                <StatRow label={D.maxDd} value={fmtMoney(-s.maxDrawdown, cur)} tone={s.maxDrawdown ? "loss" : null} />
                <StatRow label={D.streak} value={`${s.maxConsecutiveWins} / ${s.maxConsecutiveLosses}`} />
                <StatRow label={D.commissions} value={fmtMoney(s.totalFees, cur)} />
                <StatRow label={D.equity} value={fmtMoney(balance, cur)} hint={openCount ? fmt(D.openUnrealized, { n: openCount }) : D.noOpen} />
              </dl>
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <PeriodChart sets={sets} />
            <WinLossChart wins={s.wins} losses={s.losses} breakeven={s.breakeven} grossProfit={s.grossProfit} grossLoss={s.grossLoss} avgWin={s.avgWin} avgLoss={s.avgLoss} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <DrawdownChart points={points} />
            <Card title={D.breakdown} subtitle={D.breakdownSub}>
              <div className="grid gap-6 sm:grid-cols-2">
                <Breakdown t={t} title={D.instrument} rows={ref.instruments.map((i) => ({ key: i.id, label: i.symbol, trades: trades.filter((x) => x.instrument_id === i.id) }))} />
                <Breakdown t={t} title={D.session} rows={[...SESSIONS.map((k) => [k, t.labels.sessions[k]] as const), ["", t.common.notSet] as const].map(([k, label]) => ({ key: k || "none", label, trades: trades.filter((x) => (x.session ?? "") === k) }))} />
              </div>
            </Card>
          </div>

          <Card
            title={D.recent}
            subtitle={fmt(D.recentSub, { n: Math.min(8, trades.length), t: trades.length })}
            actions={<Link href="/journal" className="btn btn-sm btn-ghost text-accent">{D.openJournal} <ArrowRight className="h-3.5 w-3.5" /></Link>}
            flush
          >
            {trades.length ? (
              <TradeTable rows={trades.slice(0, 8)} symbols={Object.fromEntries(sym)} accounts={Object.fromEntries(ref.accounts.map((a) => [a.id, a.name]))}
                strategies={Object.fromEntries(ref.strategies.map((x) => [x.id, x.name]))} tz={profile.trading_timezone} compact />
            ) : (
              <div className="px-5 pb-5"><Empty icon={<BookOpen className="h-5 w-5" />} title={D.noMatch} /></div>
            )}
          </Card>

          <p className="text-xs leading-relaxed text-faint">{D.footnote}{singleAccount ? "" : D.footnoteSingle}</p>
        </div>
      )}
    </div>
  );
}
