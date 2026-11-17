"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ICT_KEYS } from "@/lib/calc/analytics";
import { KNOWLEDGE_KINDS } from "@/lib/constants";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/supabase/server";
import { type ActionResult, checkbox, dbError, firstError, optEnum, optUuid, uuid } from "@/lib/validation/common";


const schema = z.object({
  id: optUuid,
  title: z.string().trim().min(1, "Required.").max(200),
  kind: z.enum(KNOWLEDGE_KINDS),
  body: z.string().max(50000).default(""),
  concept_key: optEnum(ICT_KEYS),
  strategy_id: optUuid,
  tag_id: optUuid,
  pinned: checkbox,
});

export async function saveEntry(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  const p = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return { error: firstError(p.error) };
  const { id, ...row } = p.data;
  if (id) {
    const { error } = await supabase.from("knowledge_entries").update(row).eq("id", id);
    if (error) return { error: dbError(error, "entry") };
    revalidatePath("/knowledge", "layout");
    return { ok: true, message: (await getT()).common.saved };
  }
  const { data, error } = await supabase.from("knowledge_entries").insert({ ...row, user_id: userId }).select("id").single();
  if (error) return { error: dbError(error, "entry") };
  revalidatePath("/knowledge", "layout");
  redirect(`/knowledge/${data.id}`);
}

export async function deleteEntry(fd: FormData) {
  const { supabase } = await requireUser();
  const id = uuid.parse(fd.get("id"));
  const { error } = await supabase.from("knowledge_entries").delete().eq("id", id);
  if (error) throw new Error(dbError(error, "entry"));
  revalidatePath("/knowledge", "layout");
  redirect("/knowledge");
}

export async function linkTrade(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();
  const entry = uuid.safeParse(fd.get("entry_id"));
  const trade = uuid.safeParse(fd.get("trade_id"));
  if (!entry.success || !trade.success) return { error: "Choose a trade." };
  const { error } = await supabase.from("knowledge_trade_links").upsert({ entry_id: entry.data, trade_id: trade.data, user_id: userId }, { onConflict: "entry_id,trade_id" });
  if (error) return { error: dbError(error, "link") };
  revalidatePath(`/knowledge/${entry.data}`);
  return { ok: true, message: (await getT()).knowledge.linked };
}

export async function unlinkTrade(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const entry = uuid.safeParse(fd.get("entry_id"));
  const trade = uuid.safeParse(fd.get("trade_id"));
  if (!entry.success || !trade.success) return { error: "Invalid link." };
  const { error } = await supabase.from("knowledge_trade_links").delete().eq("entry_id", entry.data).eq("trade_id", trade.data);
  if (error) return { error: dbError(error, "link") };
  revalidatePath(`/knowledge/${entry.data}`);
  return { ok: true, message: (await getT()).msg.deleted };
}
