"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/common";

export async function deleteConversation(fd: FormData): Promise<void> {
  const { supabase } = await requireUser();
  const id = uuid.safeParse(fd.get("id"));
  if (id.success) await supabase.from("ai_conversations").delete().eq("id", id.data);
  redirect("/assistant");
}
