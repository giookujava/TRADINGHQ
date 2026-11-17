import { BookOpen, Download, Plus } from "lucide-react";
import Link from "next/link";
import { FilterBar } from "@/components/filter-bar";
import { TradeTable } from "@/components/trade-table";
import { Empty, Metric, PageHeader } from "@/components/ui";
import { summarize } from "@/lib/calc/stats";
import { filtersToSearch, hasActiveFilters, parseFilters } from "@/lib/data/filters";
import { getProfile, getRefData, getTrades } from "@/lib/data/queries";
import { fmtMoney, fmtNum, fmtPct, fmtR, pnlTone } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/supabase/server";
import { todayInZone } from "@/lib/time/zone";

export const metadata = { title: "Trade Journal" };

export default async function JournalPage({ searchParams }: PageProps<"/journal">) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : undefined;
  const { supabase, userId } = await requireUser();
  const [t, profile, ref, trades] = await Promise.all([getT(), getProfile(supabase, userId), getRefData(supabase), getTrades(supabase, filters)]);
  const s = summarize(trades);
  const exportQs = filtersToSearch(filters);
  const J = t.journal, D = t.dashboard;

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title={J.title}
        subtitle={J.subtitle}
        actions={
          <>
            <a href={`/api/export/trades${exportQs}`} className="btn h-12 rounded-full px-5"><Download className="h-4 w-4" /> {J.export}</a>
            <Link href="/journal/new" className="btn btn-primary h-12 px-6 text-[15px]"><Plus className="h-5 w-5" /> {J.newTrade}</Link>
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
          title={hasActiveFilters(filters) ? J.emptyFiltered : J.empty}
          action={hasActiveFilters(filters) ? <Link href="/journal" className="btn">{J.clearFilters}</Link> : <Link href="/journal/new" className="btn btn-primary">{J.recordFirst}</Link>}
        >
          {hasActiveFilters(filters) ? J.emptyFilteredHint : J.emptyHint}
        </Empty>
      ) : (
        <>
          <div className="card mb-5 grid grid-cols-2 gap-x-6 gap-y-4 p-6 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label={J.trades} value={trades.length} hint={fmt(D.closedOpen, { c: s.closedTrades, o: s.openTrades })} />
            <Metric label={D.netPnl} value={fmtMoney(s.netPnl, "USD", true)} tone={pnlTone(s.netPnl)} />
            <Metric label={D.winRate} value={fmtPct(s.winRate)} hint={`${s.wins}W · ${s.losses}L`} />
            <Metric label={D.profitFactor} value={s.profitFactor == null ? "—" : fmtNum(s.profitFactor)} />
            <Metric label={D.avgR} value={fmtR(s.avgR)} tone={pnlTone(s.avgR)} />
            <Metric label={D.fees} value={fmtMoney(s.totalFees)} hint={J.included} />
          </div>
          <section className="card overflow-hidden">
            <TradeTable
              key={q ?? ""}
              rows={trades}
              searchable
              initialQuery={q}
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
