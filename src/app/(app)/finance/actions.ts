"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CASHFLOW_KINDS } from "@/lib/calc/finance";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/supabase/server";
import { type ActionResult, dbError, firstError, isoDate, uuid } from "@/lib/validation/common";

const schema = z
  .object({
    account_id: uuid,
    occurred_on: isoDate,
    kind: z.enum(CASHFLOW_KINDS),
    amount: z.preprocess((v) => Number(String(v ?? "").replace(/,/g, "")), z.number().finite()),
    notes: z.string().trim().max(500).default(""),
  })
  .refine((v) => v.amount !== 0, { message: "Amount cannot be 0.", path: ["amount"] })
  .refine((v) => v.kind === "adjustment" || v.amount > 0, { message: "Amount must be positive (only adjustments may be negative).", path: ["amount"] });

/** Record a deposit / withdrawal / payout / fee. Never touches trading P/L. */
export async function saveCashflow(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  const p = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return { error: firstError(p.error) };
  const { error } = await supabase.from("account_transactions").insert({ ...p.data, user_id: userId });
  if (error) return { error: dbError(error, "transaction") };
  revalidatePath("/", "layout");
  return { ok: true, message: (await getT()).finance.added };
}

export async function deleteCashflow(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Invalid transaction." };
  const { error } = await supabase.from("account_transactions").delete().eq("id", id.data);
  if (error) return { error: dbError(error, "transaction") };
  revalidatePath("/", "layout");
  return { ok: true, message: (await getT()).msg.deleted };
}
