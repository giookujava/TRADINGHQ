import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAll, getProfile, getRefData, getTrades } from "@/lib/data/queries";
import { parseFilters } from "@/lib/data/filters";
import { toCsv } from "@/lib/export/csv";
import { todayInZone } from "@/lib/time/zone";
import type { ExecutionRow, TradeRow } from "@/lib/db/types";

export const dynamic = "force-dynamic";

const BACKUP_TABLES = [
  "profiles", "accounts", "instruments", "strategies", "tags", "custom_field_definitions",
  "trades", "trade_executions", "trade_tags", "trade_screenshots", "daily_preps",
] as const;

function file(body: string, name: string, type: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": `${type}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/export/[kind]">) {
  const { kind } = await ctx.params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const profile = await getProfile(supabase, userId);
  const stamp = todayInZone(profile.trading_timezone);

  if (kind === "trades") {
    const filters = parseFilters(Object.fromEntries(request.nextUrl.searchParams));
    const [ref, list] = await Promise.all([getRefData(supabase), getTrades(supabase, filters)]);
    const ids = new Set(list.map((t) => t.id));
    const full = await fetchAll<TradeRow>((f, t) => supabase.from("trades").select("*").order("trade_date").order("entry_time").range(f, t) as never, "trades");
    const links = await fetchAll<{ trade_id: string; tag_id: string }>((f, t) => supabase.from("trade_tags").select("trade_id,tag_id").range(f, t) as never, "tags");
    const tagName = new Map(ref.tags.map((g) => [g.id, g.name]));
    const tagsByTrade = new Map<string, string[]>();
    for (const l of links) tagsByTrade.set(l.trade_id, [...(tagsByTrade.get(l.trade_id) ?? []), tagName.get(l.tag_id) ?? ""]);
    const sym = new Map(ref.instruments.map((i) => [i.id, i.symbol]));
    const acc = new Map(ref.accounts.map((a) => [a.id, a.name]));
    const strat = new Map(ref.strategies.map((s) => [s.id, s.name]));
    const rows = full.filter((t) => ids.has(t.id));
    const skip = new Set(["user_id", "custom_fields"]);
    const cols = Object.keys(rows[0] ?? { id: "" }).filter((c) => !skip.has(c));
    const cfNames = ref.customFields.map((c) => c.name);
    const headers = ["account", "instrument", "strategy", "tags", ...cols, ...cfNames.map((n) => `custom:${n}`)];
    const body = toCsv(headers, rows.map((t) => [
      acc.get(t.account_id), sym.get(t.instrument_id), t.strategy_id ? strat.get(t.strategy_id) : "",
      (tagsByTrade.get(t.id) ?? []).join("; "),
      ...cols.map((c) => t[c as keyof TradeRow] as string | number | boolean | null),
      ...ref.customFields.map((c) => t.custom_fields?.[c.id] ?? null),
    ]));
    return file(body, `tradinghq-trades-${stamp}.csv`, "text/csv");
  }

  if (kind === "executions") {
    const [ref, execs, trades] = await Promise.all([
      getRefData(supabase),
      fetchAll<ExecutionRow>((f, t) => supabase.from("trade_executions").select("*").order("executed_at").range(f, t) as never, "executions"),
      fetchAll<Pick<TradeRow, "id" | "instrument_id" | "account_id" | "trade_date" | "is_sample">>(
        (f, t) => supabase.from("trades").select("id,instrument_id,account_id,trade_date,is_sample").range(f, t) as never, "trades"),
    ]);
    const tm = new Map(trades.map((t) => [t.id, t]));
    const sym = new Map(ref.instruments.map((i) => [i.id, i.symbol]));
    const acc = new Map(ref.accounts.map((a) => [a.id, a.name]));
    const body = toCsv(
      ["trade_id", "trade_date", "account", "instrument", "executed_at_utc", "side", "quantity", "price", "fees", "source", "external_id", "is_sample"],
      execs.map((e) => {
        const t = tm.get(e.trade_id);
        return [e.trade_id, t?.trade_date, t ? acc.get(t.account_id) : "", t ? sym.get(t.instrument_id) : "", e.executed_at, e.side, e.quantity, e.price, e.fees, e.source, e.external_id, t?.is_sample ?? false];
      }),
    );
    return file(body, `tradinghq-executions-${stamp}.csv`, "text/csv");
  }

  if (kind === "backup") {
    const out: Record<string, unknown> = {
      format: "tradinghq-backup",
      version: 1,
      exported_at: new Date().toISOString(),
      note: "Screenshot image files are not embedded; trade_screenshots lists their storage paths.",
    };
    for (const table of BACKUP_TABLES) {
      out[table] = await fetchAll<Record<string, unknown>>((f, t) => supabase.from(table).select("*").order("created_at").range(f, t) as never, table);
    }
    return file(JSON.stringify(out, null, 2), `tradinghq-backup-${stamp}.json`, "application/json");
  }

  return NextResponse.json({ error: "Unknown export" }, { status: 404 });
}
