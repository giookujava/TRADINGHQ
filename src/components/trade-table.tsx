"use client";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { SESSION_LABELS, TRADE_TYPE_LABELS } from "@/lib/constants";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { formatDuration } from "@/lib/calc/trade";
import type { TradeListRow } from "@/lib/data/queries";
import { fmtMoney, fmtPrice, fmtR } from "@/lib/format";
import { formatInZone } from "@/lib/time/zone";
import { Badge, DirectionBadge, cx } from "./ui";

type SortKey = "date" | "symbol" | "net" | "r" | "qty" | "held";
type SortState = { key: SortKey; dir: 1 | -1 };

function Th({ k, children, right, sort, setSort, sortable }: {
  k?: SortKey; children: React.ReactNode; right?: boolean; sort: SortState;
  setSort: React.Dispatch<React.SetStateAction<SortState>>; sortable: boolean;
}) {
  return (
    <th className={cx(right && "text-right")} aria-sort={k && sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
      {k && sortable ? (
        <button type="button" className={cx("inline-flex items-center gap-1 uppercase hover:text-fg", sort.key === k && "text-fg")}
          onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : k === "date" || k === "net" || k === "r" ? -1 : 1 }))}>
          {children}
          {sort.key === k ? (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
        </button>
      ) : children}
    </th>
  );
}

function InstrumentChip({ symbol }: { symbol: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-accent/40 bg-accent-soft text-[10px] font-bold text-accent" aria-hidden>
        {symbol.slice(0, 2)}
      </span>
      <span className="font-semibold">{symbol}</span>
    </span>
  );
}

/**
 * Trade list table. Sorting and text search are client-side over the rows the server already
 * filtered, so they never change which records the statistics are based on.
 */
export function TradeTable({ rows, symbols, accounts, strategies, tz, compact, searchable, initialQuery }: {
  rows: TradeListRow[]; symbols: Record<string, string>; accounts: Record<string, string>; strategies: Record<string, string>;
  tz: string; compact?: boolean; searchable?: boolean; initialQuery?: string;
}) {
  const router = useRouter();
  const L = useT();
  const [q, setQ] = useState(initialQuery ?? "");
  const [sort, setSort] = useState<SortState>({ key: "date", dir: -1 });

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? rows.filter((t) => [symbols[t.instrument_id], accounts[t.account_id], t.strategy_id ? strategies[t.strategy_id] : "",
          t.session ? `${SESSION_LABELS[t.session]} ${L.labels.sessions[t.session]}` : "", t.direction, t.trade_date, TRADE_TYPE_LABELS[t.trade_type]]
          .join(" ").toLowerCase().includes(needle))
      : rows;
    const val = (t: TradeListRow): number | string => {
      switch (sort.key) {
        case "date": return `${t.trade_date} ${t.entry_time ?? ""}`;
        case "symbol": return symbols[t.instrument_id] ?? "";
        case "net": return Number(t.net_pnl ?? 0);
        case "r": return t.r_multiple ?? -Infinity;
        case "qty": return t.max_position ?? 0;
        case "held": return t.holding_seconds ?? -1;
      }
    };
    return [...filtered].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, q, sort, symbols, accounts, strategies, L]);

  const thProps = { sort, setSort, sortable: !compact };

  return (
    <div>
      {searchable ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
          <label className="relative block w-full max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L.table.search} aria-label={L.table.search} className="field pl-8" />
          </label>
          <span className="text-xs text-muted">{view.length === rows.length ? fmt(L.table.countAll, { n: rows.length }) : fmt(L.table.countSome, { v: view.length, n: rows.length })}</span>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <Th {...thProps} k="date">{L.table.date}</Th>
              <Th {...thProps} k="symbol">{L.table.instrument}</Th>
              <th>{L.table.side}</th>
              <th>{L.table.session}</th>
              <th>{L.table.strategy}</th>
              {!compact ? <th>{L.table.account}</th> : null}
              <Th {...thProps} k="qty" right>{L.table.qty}</Th>
              {!compact ? <th className="text-right">{L.table.entry}</th> : null}
              {!compact ? <th className="text-right">{L.table.exit}</th> : null}
              <Th {...thProps} k="net" right>{L.table.net}</Th>
              <Th {...thProps} k="r" right>R</Th>
              {!compact ? <Th {...thProps} k="held" right>{L.table.held}</Th> : null}
              {!compact ? <th>{L.table.rules}</th> : null}
              <th>{L.table.status}</th>
            </tr>
          </thead>
          <tbody>
            {view.map((t) => {
              const href = `/journal/${t.id}`;
              const net = Number(t.net_pnl ?? 0);
              return (
                <tr key={t.id} className="cursor-pointer" onClick={(e) => { if (!(e.target as HTMLElement).closest("a")) router.push(href); }}>
                  <td>
                    <div className="num text-[13px]">{t.trade_date}</div>
                    <div className="num text-[11px] text-faint">{formatInZone(t.entry_time, tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}{tz === "America/New_York" ? " ET" : ""}</div>
                  </td>
                  <td><Link href={href} className="hover:text-accent"><InstrumentChip symbol={symbols[t.instrument_id] ?? "?"} /></Link></td>
                  <td><DirectionBadge direction={t.direction} /></td>
                  <td className="text-muted">{t.session ? L.labels.sessions[t.session] : "—"}</td>
                  <td className="max-w-40 truncate text-muted">{t.strategy_id ? strategies[t.strategy_id] : "—"}</td>
                  {!compact ? (
                    <td className="max-w-44 truncate text-muted" title={L.labels.tradeTypes[t.trade_type]}>
                      {accounts[t.account_id]}{t.is_sample ? <Badge tone="warn" className="ml-1.5">{L.common.sample}</Badge> : null}
                    </td>
                  ) : null}
                  <td className="num text-right">{t.max_position}</td>
                  {!compact ? <td className="num text-right text-muted">{fmtPrice(t.avg_entry_price)}</td> : null}
                  {!compact ? <td className="num text-right text-muted">{fmtPrice(t.avg_exit_price)}</td> : null}
                  <td className={cx("num text-right font-semibold", net > 0 && "text-profit", net < 0 && "text-loss")}>{fmtMoney(t.net_pnl, "USD", true)}</td>
                  <td className={cx("num text-right", (t.r_multiple ?? 0) > 0 && "text-profit", (t.r_multiple ?? 0) < 0 && "text-loss")}>{fmtR(t.r_multiple)}</td>
                  {!compact ? <td className="num text-right text-muted">{formatDuration(t.holding_seconds)}</td> : null}
                  {!compact ? (
                    <td>{t.followed_rules === true ? <Badge tone="profit">✓ {L.common.yes}</Badge> : t.followed_rules === false ? <Badge tone="loss">✕ {L.common.no}</Badge> : <span className="text-faint">—</span>}</td>
                  ) : null}
                  <td>{t.status === "open" ? <Badge tone="warn">{L.common.open_}</Badge> : <Badge>{L.common.closed}</Badge>}</td>
                </tr>
              );
            })}
            {!view.length ? (
              <tr><td colSpan={14} className="py-10 text-center text-sm text-faint">{fmt(L.table.noMatchQ, { q })}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
