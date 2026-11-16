import Link from "next/link";
import { FilterBar } from "@/components/filter-bar";
import { Badge, Empty, PageHeader, cx } from "@/components/ui";
import { SESSION_LABELS, TRADE_TYPE_LABELS } from "@/lib/constants";
import { formatDuration } from "@/lib/calc/trade";
import { summarize } from "@/lib/calc/stats";
import { filtersToSearch, hasActiveFilters, parseFilters } from "@/lib/data/filters";
import { getProfile, getRefData, getTrades } from "@/lib/data/queries";
import { fmtMoney, fmtPct, fmtPrice, fmtR } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { formatInZone } from "@/lib/time/zone";

export const metadata = { title: "Trade Journal" };

export default async function JournalPage({ searchParams }: PageProps<"/journal">) {
  const filters = parseFilters(await searchParams);
  const { supabase, userId } = await requireUser();
  const [profile, ref, trades] = await Promise.all([getProfile(supabase, userId), getRefData(supabase), getTrades(supabase, filters)]);
  const tz = profile.trading_timezone;
  const sym = new Map(ref.instruments.map((i) => [i.id, i.symbol]));
  const acc = new Map(ref.accounts.map((a) => [a.id, a.name]));
  const strat = new Map(ref.strategies.map((s) => [s.id, s.name]));
  const s = summarize(trades);
  const exportQs = filtersToSearch(filters);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Trade Journal"
        subtitle={
          <span className="num">
            {trades.length} trade{trades.length === 1 ? "" : "s"} · net <span className={s.netPnl > 0 ? "text-profit" : s.netPnl < 0 ? "text-loss" : ""}>{fmtMoney(s.netPnl)}</span> · win rate {fmtPct(s.winRate)}
          </span>
        }
        actions={
          <>
            <a href={`/api/export/trades${exportQs}`} className="btn">Export CSV</a>
            <Link href="/journal/new" className="btn btn-primary">+ New trade</Link>
          </>
        }
      />
      <FilterBar
        key={filtersToSearch(filters)}
        filters={filters}
        showStatus
        accounts={ref.accounts.filter((a) => filters.sample || !a.is_sample).map((a) => ({ id: a.id, label: a.name }))}
        instruments={ref.instruments.map((i) => ({ id: i.id, label: i.symbol }))}
        strategies={ref.strategies.map((x) => ({ id: x.id, label: x.name }))}
      />
      {trades.length === 0 ? (
        <Empty title={hasActiveFilters(filters) ? "No trades match these filters" : "No trades recorded yet"}>
          {hasActiveFilters(filters) ? "Try widening the filters." : <Link href="/journal/new" className="text-accent underline">Record your first trade</Link>}
        </Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th><th>Entry ({tz.split("/").pop()?.replace("_", " ")})</th><th>Symbol</th><th>Dir</th><th>Session</th><th>Account</th><th>Strategy</th>
                <th className="text-right">Qty</th><th className="text-right">Entry</th><th className="text-right">Exit</th>
                <th className="text-right">Net P/L</th><th className="text-right">R</th><th className="text-right">Held</th><th>Rules</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id}>
                  <td className="num"><Link href={`/journal/${t.id}`} className="hover:text-accent">{t.trade_date}</Link></td>
                  <td className="num text-muted">{formatInZone(t.entry_time, tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</td>
                  <td className="font-medium"><Link href={`/journal/${t.id}`} className="hover:text-accent">{sym.get(t.instrument_id)}</Link></td>
                  <td><span className={cx("text-xs font-semibold uppercase", t.direction === "long" ? "text-profit" : "text-loss")}>{t.direction}</span></td>
                  <td className="text-muted">{t.session ? SESSION_LABELS[t.session] : "—"}</td>
                  <td className="max-w-40 truncate text-muted" title={TRADE_TYPE_LABELS[t.trade_type]}>
                    {acc.get(t.account_id)} {t.is_sample ? <Badge tone="warn">Sample</Badge> : null}
                  </td>
                  <td className="max-w-40 truncate text-muted">{t.strategy_id ? strat.get(t.strategy_id) : "—"}</td>
                  <td className="num text-right">{t.max_position}</td>
                  <td className="num text-right">{fmtPrice(t.avg_entry_price)}</td>
                  <td className="num text-right">{fmtPrice(t.avg_exit_price)}</td>
                  <td className={cx("num text-right font-medium", (t.net_pnl ?? 0) > 0 && "text-profit", (t.net_pnl ?? 0) < 0 && "text-loss")}>
                    {t.status === "open" ? <Badge tone="warn">Open</Badge> : fmtMoney(t.net_pnl, "USD", true)}
                  </td>
                  <td className="num text-right">{fmtR(t.r_multiple)}</td>
                  <td className="num text-right text-muted">{formatDuration(t.holding_seconds)}</td>
                  <td>{t.followed_rules === true ? <Badge tone="profit">Yes</Badge> : t.followed_rules === false ? <Badge tone="loss">No</Badge> : <span className="text-faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
