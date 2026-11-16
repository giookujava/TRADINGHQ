import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Account, CustomFieldDefinition, Instrument, Profile, Strategy, Tag, TradeRow } from "@/lib/db/types";
import type { TradeFilters } from "./filters";

type DB = SupabaseClient;
const PAGE = 1000; // PostgREST default max rows per request

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`Failed to load ${what}: ${error?.message ?? "unknown error"}`);
}

/** Fetch every row of a query by paging through PostgREST's row limit. */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  what: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) fail(what, error);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

export async function getProfile(db: DB, userId: string): Promise<Profile> {
  const { data, error } = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) fail("profile", error);
  if (data) return data as Profile;
  // Safety net: the sign-up trigger normally creates this row.
  const ins = await db.from("profiles").insert({ id: userId }).select("*").single();
  if (ins.error) fail("profile", ins.error);
  return ins.data as Profile;
}

export interface RefData {
  accounts: Account[];
  instruments: Instrument[];
  strategies: Strategy[];
  tags: Tag[];
  customFields: CustomFieldDefinition[];
}

export async function getRefData(db: DB): Promise<RefData> {
  const [a, i, s, t, c] = await Promise.all([
    db.from("accounts").select("*").order("is_sample").order("name"),
    db.from("instruments").select("*").order("symbol"),
    db.from("strategies").select("*").order("name"),
    db.from("tags").select("*").order("category").order("name"),
    db.from("custom_field_definitions").select("*").order("sort_order").order("name"),
  ]);
  if (a.error) fail("accounts", a.error);
  if (i.error) fail("instruments", i.error);
  if (s.error) fail("strategies", s.error);
  if (t.error) fail("tags", t.error);
  if (c.error) fail("custom fields", c.error);
  return {
    accounts: a.data as Account[],
    instruments: i.data as Instrument[],
    strategies: s.data as Strategy[],
    tags: t.data as Tag[],
    customFields: c.data as CustomFieldDefinition[],
  };
}

export const TRADE_LIST_COLUMNS =
  "id,account_id,instrument_id,strategy_id,trade_date,direction,status,session,trade_type,entry_time,exit_time," +
  "avg_entry_price,avg_exit_price,max_position,points,gross_pnl,total_fees,net_pnl,planned_risk,r_multiple," +
  "holding_seconds,followed_rules,was_planned,is_sample,source";

export type TradeListRow = Pick<
  TradeRow,
  | "id" | "account_id" | "instrument_id" | "strategy_id" | "trade_date" | "direction" | "status" | "session"
  | "trade_type" | "entry_time" | "exit_time" | "avg_entry_price" | "avg_exit_price" | "max_position" | "points"
  | "gross_pnl" | "total_fees" | "net_pnl" | "planned_risk" | "r_multiple" | "holding_seconds" | "followed_rules"
  | "was_planned" | "is_sample" | "source"
>;

/** Trades matching filters, newest first. Sample trades are excluded unless f.sample. */
export async function getTrades(db: DB, f: TradeFilters, opts: { tagId?: string } = {}): Promise<TradeListRow[]> {
  let tradeIds: string[] | null = null;
  if (opts.tagId) {
    const { data, error } = await db.from("trade_tags").select("trade_id").eq("tag_id", opts.tagId);
    if (error) fail("tag links", error);
    tradeIds = (data ?? []).map((r) => r.trade_id as string);
    if (!tradeIds.length) return [];
  }
  return fetchAll<TradeListRow>((from, to) => {
    let q = db.from("trades").select(TRADE_LIST_COLUMNS);
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
    if (tradeIds) q = q.in("id", tradeIds);
    return q
      .order("trade_date", { ascending: false })
      .order("entry_time", { ascending: false })
      .order("id")
      .range(from, to) as unknown as PromiseLike<{ data: TradeListRow[] | null; error: { message: string } | null }>;
  }, "trades");
}
