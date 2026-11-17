import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Start of the current calendar month (UTC) — the budget window. */
export function monthStart(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

/** Estimated AI spend (USD) this month, from stored assistant messages. Throws nothing; 0 if the table is missing. */
export async function monthSpend(db: SupabaseClient): Promise<number> {
  const { data } = await db.from("ai_messages").select("cost_usd").gte("created_at", monthStart()).limit(10000);
  return (data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
}
