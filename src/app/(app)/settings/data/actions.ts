"use server";
import { revalidatePath } from "next/cache";
import { calculateTrade, defaultExecutionFee } from "@/lib/calc/trade";
import { SCREENSHOT_BUCKET } from "@/lib/constants";
import type { Instrument } from "@/lib/db/types";
import { getProfile } from "@/lib/data/queries";
import { generateSampleTrades } from "@/lib/sample/generate";
import { requireUser } from "@/lib/supabase/server";
import { todayInZone } from "@/lib/time/zone";
import type { ActionResult } from "@/lib/validation/common";

const SAMPLE_ACCOUNT = "SAMPLE — Backtest";

export async function generateSampleData(): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  const existing = await supabase.from("trades").select("id", { count: "exact", head: true }).eq("is_sample", true);
  if (existing.count) return { error: "Sample data already exists. Remove it first." };

  const profile = await getProfile(supabase, userId);
  const inst = await supabase.from("instruments").select("*").in("symbol", ["MNQ", "MES"]);
  const bySym = new Map(((inst.data ?? []) as Instrument[]).map((i) => [i.symbol, i]));
  if (!bySym.get("MNQ") || !bySym.get("MES")) return { error: "MNQ and MES instruments are required for sample data." };

  const acc = await supabase
    .from("accounts")
    .upsert({ user_id: userId, name: SAMPLE_ACCOUNT, account_type: "backtest", starting_balance: 50000, is_sample: true, notes: "Sample data — safe to delete." }, { onConflict: "user_id,name" })
    .select("id")
    .single();
  if (acc.error) return { error: acc.error.message };

  const today = todayInZone(profile.trading_timezone);
  const trades = generateSampleTrades(today);
  for (const s of trades) {
    const i = bySym.get(s.symbol)!;
    // Sample fees use a visible illustrative rate, independent of the user's configured commissions.
    const spec = { commissionPerSide: 0.35, exchangeFeePerSide: 0.37 };
    const executions = s.executions.map((e) => ({ ...e, fees: defaultExecutionFee(e.quantity, spec) }));
    const calc = calculateTrade({
      instrument: { pointValue: Number(i.point_value) },
      executions: executions.map((e) => ({ executedAt: e.executed_at, side: e.side, quantity: e.quantity, price: e.price, fees: e.fees })),
      stopLoss: s.stop_loss,
    });
    const { error } = await supabase.rpc("save_trade", {
      p_trade: {
        account_id: acc.data.id, instrument_id: i.id, trade_date: s.trade_date, session: s.session, trade_type: "backtest",
        direction: calc.direction, status: calc.status, stop_loss: s.stop_loss, take_profit: s.take_profit,
        entry_time: calc.entryTime, exit_time: calc.exitTime, avg_entry_price: calc.avgEntryPrice, avg_exit_price: calc.avgExitPrice,
        max_position: calc.maxPosition, total_entry_qty: calc.totalEntryQty, total_exit_qty: calc.totalExitQty, points: calc.points,
        gross_pnl: calc.grossPnl, total_fees: calc.totalFees, net_pnl: calc.netPnl, planned_risk: calc.plannedRisk,
        r_multiple: calc.rMultiple, holding_seconds: calc.holdingSeconds, daily_bias: s.daily_bias,
        emotion_before: s.emotion_before, notes: s.notes, is_sample: true, ...s.flags,
      },
      p_executions: executions,
      p_tag_ids: [],
    });
    if (error) return { error: `Sample trade failed: ${error.message}` };
  }

  // A few sample preparations (skipped where you already have a real one for that date).
  const days = Array.from(new Set(trades.map((t) => t.trade_date))).slice(0, 5);
  for (const d of days) {
    await supabase.from("daily_preps").insert({
      user_id: userId, prep_date: d, instrument_id: bySym.get("MNQ")!.id, is_sample: true,
      daily_bias: trades.find((t) => t.trade_date === d)!.daily_bias,
      q_where_to: "SAMPLE: buy-side liquidity above PDH", q_where_from: "SAMPLE: discount FVG below the Asia low",
      q_why: "SAMPLE: HTF bullish order flow", q_when: "SAMPLE: NY AM kill zone after 09:30 open",
      trading_plan: "SAMPLE DATA — remove in Settings → Data.",
    });
  }

  revalidatePath("/", "layout");
  return { ok: true, message: `Created ${trades.length} sample trades in “${SAMPLE_ACCOUNT}”. Tick “Include sample data” to see them.` };
}

export async function removeSampleData(): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const shots = await supabase.from("trades").select("id, trade_screenshots(storage_path)").eq("is_sample", true);
  const paths = (shots.data ?? []).flatMap((t) => ((t.trade_screenshots ?? []) as { storage_path: string }[]).map((s) => s.storage_path));
  const t = await supabase.from("trades").delete({ count: "exact" }).eq("is_sample", true);
  if (t.error) return { error: t.error.message };
  const p = await supabase.from("daily_preps").delete({ count: "exact" }).eq("is_sample", true);
  if (p.error) return { error: p.error.message };
  const a = await supabase.from("accounts").delete().eq("is_sample", true);
  if (a.error) return { error: `Sample trades removed, but the sample account could not be deleted: ${a.error.message}` };
  if (paths.length) await supabase.storage.from(SCREENSHOT_BUCKET).remove(paths);
  revalidatePath("/", "layout");
  return { ok: true, message: `Removed ${t.count ?? 0} sample trades and ${p.count ?? 0} sample preparations.` };
}
