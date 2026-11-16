import { BookOpen, Download, Plus } from "lucide-react";
import Link from "next/link";
import { FilterBar } from "@/components/filter-bar";
import { TradeTable } from "@/components/trade-table";
import { Empty, Metric, PageHeader } from "@/components/ui";
import { summarize } from "@/lib/calc/stats";
import { filtersToSearch, hasActiveFilters, parseFilters } from "@/lib/data/filters";
import { getProfile, getRefData, getTrades } from "@/lib/data/queries";
import { fmtMoney, fmtNum, fmtPct, fmtR, pnlTone } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { todayInZone } from "@/lib/time/zone";

export const metadata = { title: "Trade Journal" };

export default async function JournalPage({ searchParams }: PageProps<"/journal">) {
  const filters = parseFilters(await searchParams);
  const { supabase, userId } = await requireUser();
  const [profile, ref, trades] = await Promise.all([getProfile(supabase, userId), getRefData(supabase), getTrades(supabase, filters)]);
  const s = summarize(trades);
  const exportQs = filtersToSearch(filters);

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        eyebrow="Overview"
        title="Trade journal"
        subtitle="Every recorded trade — backtest, demo, evaluation, funded and live."
        actions={
          <>
            <a href={`/api/export/trades${exportQs}`} className="btn"><Download className="h-4 w-4" /> Export CSV</a>
            <Link href="/journal/new" className="btn btn-primary"><Plus className="h-4 w-4" /> New trade</Link>
          </>
        }
      />
      <FilterBar
        filters={filters}
        today={todayInZone(profile.trading_timezone)}
        showStatus
        accounts={ref.accounts.filter((a) => filters.sample || !a.is_sample).map((a) => ({ id: a.id, label: a.name }))}
        instruments={ref.instruments.map((i) => ({ id: i.id, label: i.symbol }))}
        strategies={ref.strategies.map((x) => ({ id: x.id, label: x.name }))}
      />
      {trades.length === 0 ? (
        <Empty
          icon={<BookOpen className="h-5 w-5" />}
          title={hasActiveFilters(filters) ? "No trades match these filters" : "No trades recorded yet"}
          action={hasActiveFilters(filters) ? <Link href="/journal" className="btn">Clear filters</Link> : <Link href="/journal/new" className="btn btn-primary">Record your first trade</Link>}
        >
          {hasActiveFilters(filters) ? "Try widening the date range or removing a filter." : "Record fills exactly as executed — multiple entries and partial exits are supported."}
        </Empty>
      ) : (
        <>
          <div className="card mb-4 grid grid-cols-2 gap-x-6 gap-y-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Trades" value={trades.length} hint={`${s.closedTrades} closed · ${s.openTrades} open`} />
            <Metric label="Net P/L" value={fmtMoney(s.netPnl, "USD", true)} tone={pnlTone(s.netPnl)} />
            <Metric label="Win rate" value={fmtPct(s.winRate)} hint={`${s.wins}W · ${s.losses}L`} />
            <Metric label="Profit factor" value={s.profitFactor == null ? "—" : fmtNum(s.profitFactor)} />
            <Metric label="Average R" value={fmtR(s.avgR)} tone={pnlTone(s.avgR)} />
            <Metric label="Fees" value={fmtMoney(s.totalFees)} hint="included in net" />
          </div>
          <section className="card overflow-hidden">
            <TradeTable
              rows={trades}
              searchable
              tz={profile.trading_timezone}
              symbols={Object.fromEntries(ref.instruments.map((i) => [i.id, i.symbol]))}
              accounts={Object.fromEntries(ref.accounts.map((a) => [a.id, a.name]))}
              strategies={Object.fromEntries(ref.strategies.map((x) => [x.id, x.name]))}
            />
          </section>
        </>
      )}
    </div>
  );
}
