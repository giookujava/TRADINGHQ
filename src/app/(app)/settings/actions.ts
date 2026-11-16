"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ACCOUNT_TYPES, CUSTOM_FIELD_TYPES, TAG_CATEGORIES } from "@/lib/constants";
import { requireUser } from "@/lib/supabase/server";
import { isValidTimeZone } from "@/lib/time/zone";
import {
  type ActionResult, checkbox, dbError, firstError, optNum, optText, optUuid, reqNum, reqText,
} from "@/lib/validation/common";

const entries = (fd: FormData) => Object.fromEntries(fd.entries());
const done = (path: string, message?: string): ActionResult => {
  revalidatePath(path);
  revalidatePath("/", "layout");
  return { ok: true, message };
};

// ---------------------------------------------------------------- profile
const profileSchema = z.object({
  display_name: optText(100),
  trading_timezone: z.string().refine(isValidTimeZone, "Unknown timezone."),
  display_timezone: z.preprocess((v) => (v === "" ? null : v), z.string().refine(isValidTimeZone, "Unknown timezone.").nullable()),
  currency: z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code."),
  default_instrument_id: optUuid,
});

export async function updateProfile(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  const p = profileSchema.safeParse(entries(fd));
  if (!p.success) return { error: firstError(p.error) };
  const { error } = await supabase.from("profiles").update(p.data).eq("id", userId);
  if (error) return { error: dbError(error, "profile") };
  return done("/settings");
}

// ---------------------------------------------------------------- accounts
const accountSchema = z.object({
  id: optUuid,
  name: reqText(100),
  account_type: z.enum(ACCOUNT_TYPES),
  broker: z.string().trim().max(100).default(""),
  platform: z.string().trim().max(100).default(""),
  currency: z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code.").default("USD"),
  starting_balance: reqNum,
  is_active: checkbox,
  notes: z.string().max(2000).default(""),
  prop_firm: optText(100),
  account_size: optNum,
  profit_target: optNum,
  daily_loss_limit: optNum,
  max_drawdown: optNum,
});

export async function saveAccount(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  if (fd.get("intent") === "delete") {
    const id = optUuid.parse(fd.get("id"));
    if (!id) return { error: "Missing account." };
    const { count } = await supabase.from("trades").select("id", { count: "exact", head: true }).eq("account_id", id);
    if (count) return { error: `This account has ${count} trade(s). Deactivate it instead, or delete its trades first.` };
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) return { error: dbError(error, "account") };
    return done("/settings/accounts", "Deleted.");
  }
  const p = accountSchema.safeParse(entries(fd));
  if (!p.success) return { error: firstError(p.error) };
  const { id, ...row } = p.data;
  const { error } = id
    ? await supabase.from("accounts").update(row).eq("id", id)
    : await supabase.from("accounts").insert({ ...row, user_id: userId });
  if (error) return { error: dbError(error, "account") };
  return done("/settings/accounts", id ? "Saved." : "Account created.");
}

// ---------------------------------------------------------------- instruments
const instrumentSchema = z
  .object({
    id: optUuid,
    symbol: z.string().trim().toUpperCase().regex(/^[A-Z0-9.]{1,20}$/, "Symbol: letters/digits only."),
    name: z.string().trim().max(100).default(""),
    exchange: z.string().trim().max(30).default(""),
    tick_size: reqNum.refine((n) => n > 0, "Tick size must be > 0."),
    point_value: reqNum.refine((n) => n > 0, "Point value must be > 0."),
    commission_per_side: reqNum.refine((n) => n >= 0, "Commission cannot be negative."),
    exchange_fee_per_side: reqNum.refine((n) => n >= 0, "Fees cannot be negative."),
    is_active: checkbox,
  })
  .transform((v) => ({ ...v, tick_value: Math.round(v.tick_size * v.point_value * 1e8) / 1e8 }));

export async function saveInstrument(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  if (fd.get("intent") === "delete") {
    const id = optUuid.parse(fd.get("id"));
    if (!id) return { error: "Missing instrument." };
    const { error } = await supabase.from("instruments").delete().eq("id", id);
    if (error) return { error: dbError(error, "instrument") };
    return done("/settings/instruments", "Deleted.");
  }
  const p = instrumentSchema.safeParse(entries(fd));
  if (!p.success) return { error: firstError(p.error) };
  const { id, ...row } = p.data;
  const { error } = id
    ? await supabase.from("instruments").update(row).eq("id", id)
    : await supabase.from("instruments").insert({ ...row, user_id: userId });
  if (error) return { error: dbError(error, "instrument") };
  return done(
    "/settings/instruments",
    id ? "Saved. Existing trades keep their stored P/L until re-saved." : "Instrument added.",
  );
}

// ---------------------------------------------------------------- strategies
const strategySchema = z.object({
  id: optUuid,
  name: reqText(100),
  description: z.string().max(5000).default(""),
  is_active: checkbox,
});

export async function saveStrategy(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  if (fd.get("intent") === "delete") {
    const id = optUuid.parse(fd.get("id"));
    if (!id) return { error: "Missing strategy." };
    const { error } = await supabase.from("strategies").delete().eq("id", id);
    if (error) return { error: dbError(error, "strategy") };
    return done("/settings/journal", "Deleted. Trades that used it now show no strategy.");
  }
  const p = strategySchema.safeParse(entries(fd));
  if (!p.success) return { error: firstError(p.error) };
  const { id, ...row } = p.data;
  const { error } = id
    ? await supabase.from("strategies").update(row).eq("id", id)
    : await supabase.from("strategies").insert({ ...row, user_id: userId });
  if (error) return { error: dbError(error, "strategy") };
  return done("/settings/journal");
}

// ---------------------------------------------------------------- tags
const tagSchema = z.object({
  id: optUuid,
  name: reqText(60),
  category: z.enum(TAG_CATEGORIES),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colour must be #RRGGBB.").default("#64748b"),
});

export async function saveTag(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  if (fd.get("intent") === "delete") {
    const id = optUuid.parse(fd.get("id"));
    if (!id) return { error: "Missing tag." };
    const { error } = await supabase.from("tags").delete().eq("id", id);
    if (error) return { error: dbError(error, "tag") };
    return done("/settings/journal", "Deleted.");
  }
  const p = tagSchema.safeParse(entries(fd));
  if (!p.success) return { error: firstError(p.error) };
  const { id, ...row } = p.data;
  const { error } = id
    ? await supabase.from("tags").update(row).eq("id", id)
    : await supabase.from("tags").insert({ ...row, user_id: userId });
  if (error) return { error: dbError(error, "tag") };
  return done("/settings/journal");
}

// ---------------------------------------------------------------- custom fields
const customFieldSchema = z.object({
  id: optUuid,
  name: reqText(60),
  field_type: z.enum(CUSTOM_FIELD_TYPES),
  options: z.string().max(2000).default(""),
  sort_order: z.coerce.number().int().default(0),
  is_active: checkbox,
});

export async function saveCustomField(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  if (fd.get("intent") === "delete") {
    const id = optUuid.parse(fd.get("id"));
    if (!id) return { error: "Missing field." };
    const { error } = await supabase.from("custom_field_definitions").delete().eq("id", id);
    if (error) return { error: dbError(error, "custom field") };
    return done("/settings/journal", "Deleted. Values already stored on trades are kept in exports.");
  }
  const p = customFieldSchema.safeParse(entries(fd));
  if (!p.success) return { error: firstError(p.error) };
  const { id, options, ...rest } = p.data;
  const opts = options.split(",").map((s) => s.trim()).filter(Boolean);
  if (rest.field_type === "select" && opts.length < 2) return { error: "A select field needs at least two comma-separated options." };
  const row = { ...rest, options: rest.field_type === "select" ? opts : [] };
  const { error } = id
    ? await supabase.from("custom_field_definitions").update(row).eq("id", id)
    : await supabase.from("custom_field_definitions").insert({ ...row, user_id: userId });
  if (error) return { error: dbError(error, "custom field") };
  return done("/settings/journal");
}
