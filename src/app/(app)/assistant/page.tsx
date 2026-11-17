import { Bot, MessageSquarePlus, Trash2 } from "lucide-react";
import Link from "next/link";
import { SubmitButton } from "@/components/action-form";
import { Notice, PageHeader, cx } from "@/components/ui";
import { AI_MODELS, DEFAULT_AI_MODEL, isAiModel } from "@/lib/ai/models";
import { openAiConfigured } from "@/lib/ai/openai";
import { monthSpend } from "@/lib/ai/usage";
import { getProfile } from "@/lib/data/queries";
import type { AiConversation, AiMessage } from "@/lib/db/types";
import { fmt } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/common";
import { deleteConversation } from "./actions";
import { Chat } from "./chat";

export const metadata = { title: "AI Assistant" };

export default async function AssistantPage({ searchParams }: PageProps<"/assistant">) {
  const sp = await searchParams;
  const { supabase, userId } = await requireUser();
  const [t, profile] = await Promise.all([getT(), getProfile(supabase, userId)]);
  const A = t.assistant;
  const convs = await supabase.from("ai_conversations").select("id,title,updated_at").order("updated_at", { ascending: false }).limit(100);
  const migrationMissing = Boolean(convs.error);
  const conversations = (convs.data ?? []) as AiConversation[];
  const cId = typeof sp.c === "string" && uuid.safeParse(sp.c).success ? sp.c : null;
  let messages: AiMessage[] = [];
  if (cId) {
    const { data } = await supabase.from("ai_messages").select("*").eq("conversation_id", cId).order("created_at").limit(500);
    messages = (data ?? []) as AiMessage[];
  }
  const spent = migrationMissing ? 0 : await monthSpend(supabase);
  const budget = Number(profile.ai_monthly_budget_usd ?? 5);
  const model = isAiModel(profile.ai_model) ? profile.ai_model : DEFAULT_AI_MODEL;
  const keyOk = openAiConfigured();
  const enabled = profile.ai_enabled !== false;

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader title={A.title} subtitle={A.subtitle}
        actions={<Link href="/assistant" className="btn btn-primary"><MessageSquarePlus className="h-4 w-4" /> {A.newChat}</Link>} />
      {migrationMissing ? <Notice tone="warn" className="mb-5">{t.finance.migration}</Notice> : null}
      {!keyOk ? <Notice tone="warn" className="mb-5">{A.noKey}</Notice> : null}
      {!enabled ? <Notice tone="warn" className="mb-5">{A.disabled} <Link href="/settings" className="underline">{t.nav.settings}</Link></Notice> : null}

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="card flex max-h-[70vh] flex-col p-3">
          <div className="eyebrow px-2 pb-2">{A.history}</div>
          <ul className="flex-1 space-y-1 overflow-y-auto">
            {conversations.length === 0 ? <li className="px-2 text-sm text-faint">{A.noChats}</li> : null}
            {conversations.map((c) => (
              <li key={c.id} className="group flex items-center gap-1">
                <Link href={`/assistant?c=${c.id}`} className={cx("min-w-0 flex-1 truncate rounded-xl px-3 py-2 text-sm",
                  c.id === cId ? "bg-accent-soft font-semibold text-accent" : "text-fg/85 hover:bg-surface-2")}>{c.title || "—"}</Link>
                <form action={deleteConversation}>
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton className="btn-ghost btn-icon btn-sm text-faint opacity-0 group-hover:opacity-100 focus:opacity-100" confirm={A.deleteConfirm} confirmLabel={t.common.delete}>
                    <Trash2 className="h-4 w-4" />
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1 border-t border-line px-2 pt-3 text-xs text-muted">
            <div className="flex items-center gap-1.5"><Bot className="h-3.5 w-3.5" /> {AI_MODELS[model].label}</div>
            <div className="num">{fmt(A.usage, { s: spent.toFixed(2), b: budget.toFixed(2) })}</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full bg-accent" style={{ width: `${Math.min(100, budget > 0 ? (spent / budget) * 100 : 100)}%` }} /></div>
            <p className="text-faint">{A.usageHint}</p>
          </div>
        </aside>
        <Chat key={cId ?? "new"} conversationId={cId} disabled={!keyOk || !enabled || migrationMissing}
          initial={messages.map((m) => ({ id: m.id, role: m.role, content: m.content, cost: Number(m.cost_usd ?? 0), tools: m.meta?.tools ?? [] }))} />
      </div>
    </div>
  );
}
