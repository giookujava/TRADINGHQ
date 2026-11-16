"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SCREENSHOT_BUCKET, SCREENSHOT_PHASES } from "@/lib/constants";
import { calculateTrade, TradeCalcError } from "@/lib/calc/trade";
import type { CustomFieldDefinition, Instrument } from "@/lib/db/types";
import { getProfile } from "@/lib/data/queries";
import { requireUser } from "@/lib/supabase/server";
import { zonedTimeToUtc } from "@/lib/time/zone";
import { type ActionResult, dbError, firstError, uuid } from "@/lib/validation/common";
import { executionSchema, tradeFormSchema } from "@/lib/validation/trade";

function parseCustomFields(fd: FormData, defs: CustomFieldDefinition[]) {
  const out: Record<string, string | number | boolean | null> = {};
  for (const d of defs) {
    const raw = fd.get(`cf:${d.id}`);
    if (raw == null || raw === "") continue;
    const s = String(raw).trim().slice(0, 2000);
    if (d.field_type === "number") {
      const n = Number(s);
      if (!Number.isFinite(n)) throw new Error(`Custom field “${d.name}” must be a number.`);
      out[d.id] = n;
    } else if (d.field_type === "boolean") {
      out[d.id] = s === "yes";
    } else if (d.field_type === "select") {
      if (!d.options.includes(s)) throw new Error(`Invalid option for “${d.name}”.`);
      out[d.id] = s;
    } else {
      out[d.id] = s;
    }
  }
  return out;
}

export async function saveTrade(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();

  const parsed = tradeFormSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const form = parsed.data;

  let rawExecs: unknown;
  try {
    rawExecs = JSON.parse(String(fd.get("executions") ?? "[]"));
  } catch {
    return { error: "Executions could not be read." };
  }
  const execParsed = z.array(executionSchema).min(1, "Add at least one execution.").max(200).safeParse(rawExecs);
  if (!execParsed.success) return { error: firstError(execParsed.error) };

  const tagIds = z.array(uuid).max(100).safeParse(fd.getAll("tag_ids"));
  if (!tagIds.success) return { error: "Invalid tags." };

  const [profile, instRes, cfRes] = await Promise.all([
    getProfile(supabase, userId),
    supabase.from("instruments").select("*").eq("id", form.instrument_id).maybeSingle(),
    supabase.from("custom_field_definitions").select("*").eq("is_active", true),
  ]);
  if (instRes.error || !instRes.data) return { error: "Instrument not found." };
  const instrument = instRes.data as Instrument;

  let customFields: Record<string, string | number | boolean | null>;
  try {
    customFields = parseCustomFields(fd, (cfRes.data ?? []) as CustomFieldDefinition[]);
  } catch (e) {
    return { error: (e as Error).message };
  }

  // Preserve values of custom fields that were deactivated since the trade was created.
  let source: "manual" | "csv" | "tradovate" = "manual";
  let isSample = false;
  if (form.id) {
    const existing = await supabase.from("trades").select("custom_fields,source,is_sample").eq("id", form.id).maybeSingle();
    if (existing.error || !existing.data) return { error: "Trade not found." };
    customFields = { ...(existing.data.custom_fields as Record<string, never>), ...customFields };
    for (const d of (cfRes.data ?? []) as CustomFieldDefinition[]) {
      if (fd.get(`cf:${d.id}`) === "" ) delete customFields[d.id];
    }
    source = existing.data.source;
    isSample = existing.data.is_sample;
  }

  const tz = profile.trading_timezone;
  let executions;
  try {
    executions = execParsed.data.map((e) => ({
      executed_at: zonedTimeToUtc(e.executed_local, tz).toISOString(),
      side: e.side,
      quantity: e.quantity,
      price: e.price,
      fees: Math.round(e.fees * 100) / 100,
    }));
  } catch (e) {
    return { error: (e as Error).message };
  }

  let calc;
  try {
    calc = calculateTrade({
      instrument: { pointValue: Number(instrument.point_value) },
      executions: executions.map((e) => ({ executedAt: e.executed_at, side: e.side, quantity: e.quantity, price: e.price, fees: e.fees })),
      stopLoss: form.stop_loss,
      plannedRiskOverride: form.planned_risk_override,
      adjustmentFees: form.adjustment_fees,
    });
  } catch (e) {
    if (e instanceof TradeCalcError) return { error: e.message };
    throw e;
  }

  const { id, ...fields } = form;
  const trade = {
    ...(id ? { id } : {}),
    ...fields,
    direction: calc.direction,
    status: calc.status,
    entry_time: calc.entryTime,
    exit_time: calc.exitTime,
    avg_entry_price: calc.avgEntryPrice,
    avg_exit_price: calc.avgExitPrice,
    max_position: calc.maxPosition,
    total_entry_qty: calc.totalEntryQty,
    total_exit_qty: calc.totalExitQty,
    points: calc.points,
    gross_pnl: calc.grossPnl,
    total_fees: calc.totalFees,
    net_pnl: calc.netPnl,
    planned_risk: calc.plannedRisk,
    r_multiple: calc.rMultiple,
    holding_seconds: calc.holdingSeconds,
    custom_fields: customFields,
    source,
    is_sample: isSample,
  };

  const { data: savedId, error } = await supabase.rpc("save_trade", {
    p_trade: trade,
    p_executions: executions.map((e) => ({ ...e, source })),
    p_tag_ids: tagIds.data,
  });
  if (error) return { error: dbError(error, "trade") };

  revalidatePath("/", "layout");
  redirect(`/journal/${savedId as string}`);
}

export async function deleteTrade(formData: FormData) {
  const { supabase } = await requireUser();
  const id = uuid.parse(formData.get("id"));
  const shots = await supabase.from("trade_screenshots").select("storage_path").eq("trade_id", id);
  const { error } = await supabase.from("trades").delete().eq("id", id);
  if (error) throw new Error(dbError(error, "trade"));
  const paths = (shots.data ?? []).map((s) => s.storage_path as string);
  if (paths.length) await supabase.storage.from(SCREENSHOT_BUCKET).remove(paths);
  revalidatePath("/", "layout");
  redirect("/journal");
}

// ---------------------------------------------------------------- screenshots
const shotSchema = z.object({
  trade_id: uuid,
  storage_path: z.string().min(1).max(500),
  phase: z.enum(SCREENSHOT_PHASES),
  caption: z.string().max(1000).default(""),
});

/** Record a screenshot that the browser has already uploaded to the user's Storage folder. */
export async function addScreenshot(input: z.input<typeof shotSchema>): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  const p = shotSchema.safeParse(input);
  if (!p.success) return { error: firstError(p.error) };
  if (!p.data.storage_path.startsWith(`${userId}/${p.data.trade_id}/`)) return { error: "Invalid storage path." };
  const { error } = await supabase.from("trade_screenshots").insert({ ...p.data, user_id: userId });
  if (error) {
    await supabase.storage.from(SCREENSHOT_BUCKET).remove([p.data.storage_path]);
    return { error: dbError(error, "screenshot") };
  }
  revalidatePath(`/journal/${p.data.trade_id}`);
  return { ok: true };
}

export async function updateScreenshot(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Invalid screenshot." };
  if (fd.get("intent") === "delete") {
    const row = await supabase.from("trade_screenshots").select("storage_path,trade_id").eq("id", id.data).maybeSingle();
    if (!row.data) return { error: "Screenshot not found." };
    const { error } = await supabase.from("trade_screenshots").delete().eq("id", id.data);
    if (error) return { error: dbError(error, "screenshot") };
    await supabase.storage.from(SCREENSHOT_BUCKET).remove([row.data.storage_path]);
    revalidatePath(`/journal/${row.data.trade_id}`);
    return { ok: true, message: "Deleted." };
  }
  const p = z.object({ phase: z.enum(SCREENSHOT_PHASES), caption: z.string().max(1000) }).safeParse({
    phase: fd.get("phase"), caption: fd.get("caption") ?? "",
  });
  if (!p.success) return { error: firstError(p.error) };
  const { data, error } = await supabase.from("trade_screenshots").update(p.data).eq("id", id.data).select("trade_id").single();
  if (error) return { error: dbError(error, "screenshot") };
  revalidatePath(`/journal/${data.trade_id}`);
  return { ok: true };
}
