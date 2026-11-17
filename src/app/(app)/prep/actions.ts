"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { BIASES, EXPECTED_DIRECTIONS, KEY_LEVELS, SESSIONS, VOLATILITY } from "@/lib/constants";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/supabase/server";
import { type ActionResult, dbError, firstError, isoDate, optEnum, optNum, optText, optUuid, triBool, uuid } from "@/lib/validation/common";

const levelShape = Object.fromEntries(KEY_LEVELS.map(([k]) => [k, optNum])) as Record<(typeof KEY_LEVELS)[number][0], typeof optNum>;

const prepSchema = z.object({
  id: optUuid,
  prep_date: isoDate,
  instrument_id: optUuid,
  daily_bias: optEnum(BIASES),
  expected_direction: optEnum(EXPECTED_DIRECTIONS),
  expected_volatility: optEnum(VOLATILITY),
  planned_session: optEnum(SESSIONS),
  q_where_to: optText(),
  q_where_from: optText(),
  q_why: optText(),
  q_when: optText(),
  htf_analysis: optText(),
  liquidity_levels: optText(),
  liquidity_targets: optText(),
  economic_news: optText(),
  potential_setups: optText(),
  observations: optText(),
  trading_plan: optText(),
  actual_outcome: optText(),
  bias_correct: triBool,
  target_reached: triBool,
  setup_correct: triBool,
  followed_plan: triBool,
  could_improve: optText(),
  lessons_today: optText(),
  ...levelShape,
});

const REVIEW_KEYS = ["actual_outcome", "bias_correct", "target_reached", "setup_correct", "followed_plan", "could_improve", "lessons_today"] as const;

export async function savePrep(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  const p = prepSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return { error: firstError(p.error) };
  const { id, ...row } = p.data;
  const reviewed = REVIEW_KEYS.some((k) => row[k] !== null);

  let savedId = id;
  if (id) {
    const existing = await supabase.from("daily_preps").select("reviewed_at").eq("id", id).maybeSingle();
    if (!existing.data) return { error: "Preparation not found." };
    const reviewed_at = reviewed ? existing.data.reviewed_at ?? new Date().toISOString() : null;
    const { error } = await supabase.from("daily_preps").update({ ...row, reviewed_at }).eq("id", id);
    if (error) return { error: dbError(error, "preparation for this date and instrument") };
  } else {
    const { data, error } = await supabase
      .from("daily_preps")
      .insert({ ...row, user_id: userId, reviewed_at: reviewed ? new Date().toISOString() : null })
      .select("id")
      .single();
    if (error) return { error: dbError(error, "preparation for this date and instrument") };
    savedId = data.id;
  }
  revalidatePath("/prep", "layout");
  if (!id) redirect(`/prep/${row.prep_date}?id=${savedId}`);
  return { ok: true, message: (await getT()).common.saved };
}

export async function deletePrep(fd: FormData) {
  const { supabase } = await requireUser();
  const id = uuid.parse(fd.get("id"));
  const date = isoDate.parse(fd.get("prep_date"));
  const { error } = await supabase.from("daily_preps").delete().eq("id", id);
  if (error) throw new Error(dbError(error, "preparation"));
  revalidatePath("/prep", "layout");
  redirect(`/prep/${date}`);
}
