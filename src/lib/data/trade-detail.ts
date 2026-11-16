import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExecutionRow, ScreenshotRow, TradeRow } from "@/lib/db/types";

export async function getTradeDetail(db: SupabaseClient, id: string) {
  const [t, e, s, g] = await Promise.all([
    db.from("trades").select("*").eq("id", id).maybeSingle(),
    db.from("trade_executions").select("*").eq("trade_id", id).order("executed_at").order("created_at"),
    db.from("trade_screenshots").select("*").eq("trade_id", id).order("phase").order("sort_order").order("created_at"),
    db.from("trade_tags").select("tag_id").eq("trade_id", id),
  ]);
  if (t.error) throw new Error(t.error.message);
  if (!t.data) return null;
  return {
    trade: t.data as TradeRow,
    executions: (e.data ?? []) as ExecutionRow[],
    screenshots: (s.data ?? []) as ScreenshotRow[],
    tagIds: (g.data ?? []).map((r) => r.tag_id as string),
  };
}
