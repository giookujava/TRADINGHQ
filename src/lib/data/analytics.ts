import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ICT_KEYS, PSYCH_KEYS, type AnalyticsTrade } from "@/lib/calc/analytics";
import type { AccountTransaction } from "@/lib/db/types";
import type { TradeFilters } from "./filters";
import { fetchAll } from "./queries";

const COLS =
  "id,account_id,instrument_id,strategy_id,trade_date,direction,status,session,trade_type,entry_time,exit_time,net_pnl,gross_pnl,total_fees," +
  "r_multiple,holding_seconds,daily_bias," + [...ICT_KEYS, ...PSYCH_KEYS].join(",");

type Row = Record<string, unknown>;

/** Trades (filtered like the journal) enriched with ICT/psychology flags and tag ids, for analytics and the AI. */
export async function getAnalyticsTrades(db: SupabaseClient, f: TradeFilters): Promise<AnalyticsTrade[]> {
  const [rows, links] = await Promise.all([
    fetchAll<Row>((from, to) => {
      let q = db.from("trades").select(COLS);
      if (!f.sample) q = q.eq("is_sample", false);
      if (f.from) q = q.gte("trade_date", f.from);
      if (f.to) q = q.lte("trade_date", f.to);
      if (f.account) q = q.eq("account_id", f.account);
      if (f.instrument) q = q.eq("instrument_id", f.instrument);
      if (f.strategy) q = q.eq("strategy_id", f.strategy);
      if (f.type) q = q.eq("trade_type", f.type);
      if (f.direction) q = q.eq("direction", f.direction);
      if (f.status) q = q.eq("status", f.status);
      if (f.session === "ny") q = q.in("session", ["ny_am", "ny_lunch", "ny_pm"]);
      else if (f.session) q = q.eq("session", f.session);
      return q.order("trade_date").order("entry_time").order("id").range(from, to) as never;
    }, "trades"),
    fetchAll<{ trade_id: string; tag_id: string }>((from, to) => db.from("trade_tags").select("trade_id,tag_id").range(from, to) as never, "tags"),
  ]);
  const tagsByTrade = new Map<string, string[]>();
  for (const l of links) tagsByTrade.set(l.trade_id, [...(tagsByTrade.get(l.trade_id) ?? []), l.tag_id]);
  return rows.map((r) => ({
    id: r.id as string,
    trade_date: r.trade_date as string,
    entry_time: (r.entry_time as string) ?? null,
    exit_time: (r.exit_time as string) ?? null,
    status: r.status as "open" | "closed",
    net_pnl: r.net_pnl as number | null,
    gross_pnl: r.gross_pnl as number | null,
    total_fees: r.total_fees as number | null,
    r_multiple: r.r_multiple as number | null,
    account_id: r.account_id as string,
    instrument_id: r.instrument_id as string,
    strategy_id: (r.strategy_id as string) ?? null,
    direction: r.direction as "long" | "short",
    session: (r.session as string) ?? null,
    trade_type: r.trade_type as string,
    daily_bias: (r.daily_bias as string) ?? null,
    holding_seconds: (r.holding_seconds as number) ?? null,
    tag_ids: tagsByTrade.get(r.id as string) ?? [],
    flags: Object.fromEntries([...ICT_KEYS, ...PSYCH_KEYS].map((k) => [k, (r[k] as boolean | null) ?? null])),
  }));
}

export async function getCashflows(db: SupabaseClient, opts: { sample: boolean; accountId?: string }): Promise<AccountTransaction[]> {
  return fetchAll<AccountTransaction>((from, to) => {
    let q = db.from("account_transactions").select("*");
    if (!opts.sample) q = q.eq("is_sample", false);
    if (opts.accountId) q = q.eq("account_id", opts.accountId);
    return q.order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).range(from, to) as never;
  }, "cash flows");
}
