import Link from "next/link";
import { DrawdownChart, EquityChart, PeriodChart, WinLossChart } from "@/components/charts";
import { FilterBar } from "@/components/filter-bar";
import { Empty, Notice, PageHeader, Stat } from "@/components/ui";
import { bucketByPeriod, equitySeries, sampleNote, summarize } from "@/lib/calc/stats";
import { roundMoney, sum } from "@/lib/calc/money";
import { filtersToSearch, hasActiveFilters, parseFilters } from "@/lib/data/filters";
import { getProfile, getRefData, getTrades } from "@/lib/data/queries";
import { fmtMoney, fmtNum, fmtPct, fmtR, pnlTone } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const filters = parseFilters(await searchParams);
  const { supabase, userId } = await requireUser();
  const [profile, ref, trades] = await Promise.all([getProfile(supabase, userId), getRefData(supabase), getTrades(supabase, filters)]);
  const cur = profile.currency;

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
  const points = equitySeries(trades, filters.account ? startingBalance : 0);
  const note = sampleNote(s.closedTrades);
  const sets = {
    day: bucketByPeriod(trades, "day"),
    week: bucketByPeriod(trades, "week"),
    month: bucketByPeriod(trades, "month"),
    year: bucketByPeriod(trades, "year"),
  };
  const noData = trades.length === 0 && !hasActiveFilters(filters);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="Dashboard"
        subtitle={filters.sample ? "Including sample data" : "Your recorded trades (sample data excluded)"}
        actions={<Link href="/journal/new" className="btn btn-primary">+ New trade</Link>}
      />
      <FilterBar
        key={filtersToSearch(filters)}
        filters={filters}
        accounts={ref.accounts.filter((a) => filters.sample || !a.is_sample).map((a) => ({ id: a.id, label: a.name }))}
        instruments={ref.instruments.map((i) => ({ id: i.id, label: i.symbol }))}
        strategies={ref.strategies.map((x) => ({ id: x.id, label: x.name }))}
      />

      {noData ? (
        <Empty title="No trades yet">
          {ref.accounts.length === 0 ? (
            <>Start by <Link href="/settings/accounts" className="text-accent underline">creating an account</Link>, then record a trade. Want to explore first? Generate removable sample data in <Link href="/settings/data" className="text-accent underline">Settings → Data</Link>.</>
          ) : (
            <><Link href="/journal/new" className="text-accent underline">Record your first trade</Link> — every figure here is calculated from your real records.</>
          )}
        </Empty>
      ) : (
        <>
          {note ? <Notice tone="warn">{note}</Notice> : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Net P/L" value={fmtMoney(s.netPnl, cur, true)} tone={pnlTone(s.netPnl)} hint={`before fees ${fmtMoney(s.pnlBeforeFees, cur)}`} />
            <Stat label="Win rate" value={fmtPct(s.winRate)} hint={`${s.wins}W · ${s.losses}L · ${s.breakeven}BE`} />
            <Stat label="Profit factor" value={s.profitFactor == null ? "—" : fmtNum(s.profitFactor)} hint={s.losses ? "gross profit ÷ |gross loss|" : "no losing trades yet"} />
            <Stat label="Average R" value={fmtR(s.avgR)} hint={`${s.rSampleSize} trade${s.rSampleSize === 1 ? "" : "s"} with planned risk`} />
            <Stat label="Max drawdown" value={fmtMoney(-s.maxDrawdown, cur)} tone={s.maxDrawdown ? "loss" : null} hint="peak-to-trough of cumulative net P/L" />
            <Stat label="Total trades" value={s.totalTrades} hint={`${s.closedTrades} closed · ${s.openTrades} open`} />
            <Stat label="Gross profit" value={fmtMoney(s.grossProfit, cur)} tone={s.grossProfit ? "profit" : null} hint="Σ net P/L of winners" />
            <Stat label="Gross loss" value={fmtMoney(s.grossLoss, cur)} tone={s.grossLoss ? "loss" : null} hint="Σ net P/L of losers" />
            <Stat label="Avg winner / loser" value={<span>{fmtMoney(s.avgWin, cur)} <span className="text-faint">/</span> {fmtMoney(s.avgLoss, cur)}</span>} />
            <Stat label="Commissions & fees" value={fmtMoney(s.totalFees, cur)} hint="already deducted from net P/L" />
            <Stat
              label="Account balance"
              value={fmtMoney(balance, cur)}
              hint={`${balanceAccounts.length} account${balanceAccounts.length === 1 ? "" : "s"} · start ${fmtMoney(startingBalance, cur)} + realized ${fmtMoney(realized, cur, true)}`}
            />
            <Stat
              label="Equity"
              value={fmtMoney(balance, cur)}
              hint={openCount ? `${openCount} open trade(s): unrealized P/L needs live prices (Phase 4)` : "no open positions"}
            />
            <Stat label="Expectancy" value={fmtMoney(s.expectancy, cur, true)} hint="net P/L per closed trade" />
            <Stat label="Best streak" value={`${s.maxConsecutiveWins}W / ${s.maxConsecutiveLosses}L`} hint="max consecutive wins / losses" />
            <Stat label="Largest win / loss" value={<span>{fmtMoney(s.largestWin, cur)} <span className="text-faint">/</span> {fmtMoney(s.largestLoss, cur)}</span>} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <EquityChart points={points} startingBalance={filters.account ? startingBalance : 0} />
            <DrawdownChart points={points} />
            <PeriodChart sets={sets} />
            <WinLossChart wins={s.wins} losses={s.losses} breakeven={s.breakeven} grossProfit={s.grossProfit} grossLoss={s.grossLoss} />
          </div>
          <p className="text-[11px] leading-relaxed text-faint">
            Deposits and withdrawals are not trading P/L and are never included here (cash-flow tracking arrives with Financial Management in Phase 2).
            Balance is all-time for the selected account(s); other figures follow the filters. Equity curve starts at 0 unless a single account is selected.
          </p>
        </>
      )}
    </div>
  );
}
