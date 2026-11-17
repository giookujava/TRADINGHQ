import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { DEFAULT_AI_MODEL, isAiModel } from "@/lib/ai/models";
import { openAiConfigured, runAssistant, systemPrompt } from "@/lib/ai/openai";
import { buildToolContext } from "@/lib/ai/tools";
import { monthSpend } from "@/lib/ai/usage";
import { getProfile } from "@/lib/data/queries";
import { getLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { todayInZone } from "@/lib/time/zone";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const body = z.object({
  conversationId: z.string().uuid().nullish(),
  message: z.string().trim().min(1).max(4000),
});

const err = (status: number, code: string, message?: string) => NextResponse.json({ error: code, message }, { status });

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return err(401, "unauthorized");

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return err(400, "bad_request");
  if (!openAiConfigured()) return err(503, "no_key");

  const [profile, locale] = await Promise.all([getProfile(supabase, userId), getLocale()]);
  if (profile.ai_enabled === false) return err(403, "disabled");
  const budget = Number(profile.ai_monthly_budget_usd ?? 5);
  const spent = await monthSpend(supabase);
  if (spent >= budget) return err(402, "budget", spent.toFixed(2));
  const model = isAiModel(profile.ai_model) ? profile.ai_model : DEFAULT_AI_MODEL;

  // Conversation (RLS guarantees it belongs to this user).
  let conversationId = parsed.data.conversationId ?? null;
  if (conversationId) {
    const { data } = await supabase.from("ai_conversations").select("id").eq("id", conversationId).maybeSingle();
    if (!data) return err(404, "not_found");
  } else {
    const title = parsed.data.message.replace(/\s+/g, " ").slice(0, 80);
    const { data, error } = await supabase.from("ai_conversations").insert({ user_id: userId, title }).select("id").single();
    if (error || !data) return err(500, "db", error?.message);
    conversationId = data.id as string;
  }

  const ins = await supabase.from("ai_messages").insert({ user_id: userId, conversation_id: conversationId, role: "user", content: parsed.data.message });
  if (ins.error) return err(500, "db", ins.error.message);

  const { data: hist } = await supabase.from("ai_messages").select("role,content").eq("conversation_id", conversationId)
    .order("created_at", { ascending: false }).limit(20);
  const history = ((hist ?? []) as { role: "user" | "assistant"; content: string }[]).reverse().filter((m) => !m.content.startsWith("⚠"));

  const tz = profile.trading_timezone;
  try {
    const ctx = await buildToolContext(supabase, tz, locale);
    const r = await runAssistant({
      model, history, ctx,
      instructions: systemPrompt({ locale, today: todayInZone(tz), tz, currency: profile.currency }),
    });
    const text = r.text || (locale === "ka" ? "პასუხი ვერ მივიღე." : "No answer was returned.");
    const { data: saved } = await supabase.from("ai_messages").insert({
      user_id: userId, conversation_id: conversationId, role: "assistant", content: text, model,
      input_tokens: r.usage.input, cached_tokens: r.usage.cached, output_tokens: r.usage.output, cost_usd: r.cost,
      meta: { tools: r.tools, tradeIds: [...ctx.tradeIds] },
    }).select("id,created_at").single();
    await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
    return NextResponse.json({ conversationId, message: { id: saved?.id, role: "assistant", content: text, cost_usd: r.cost, meta: { tools: r.tools } }, spent: spent + r.cost, budget });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Assistant failed";
    await supabase.from("ai_messages").insert({ user_id: userId, conversation_id: conversationId, role: "assistant", content: `⚠ ${message}`, model, meta: { error: message } });
    return NextResponse.json({ conversationId, error: "upstream", message }, { status: 502 });
  }
}
