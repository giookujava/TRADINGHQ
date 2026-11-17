import { ArrowLeft, Link2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { TradeTable } from "@/components/trade-table";
import { Card, Field, Metric, PageHeader } from "@/components/ui";
import { ICT_KEYS } from "@/lib/calc/analytics";
import { summarize } from "@/lib/calc/stats";
import { KNOWLEDGE_KINDS } from "@/lib/constants";
import { fetchAll, getProfile, getRefData, TRADE_LIST_COLUMNS, type TradeListRow } from "@/lib/data/queries";
import type { KnowledgeEntry } from "@/lib/db/types";
import { fmtMoney, fmtPct, fmtR, pnlTone } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/common";
import { deleteEntry, linkTrade, saveEntry, unlinkTrade } from "../actions";

export const metadata = { title: "Knowledge" };

export default async function KnowledgeEntryPage({ params }: PageProps<"/knowledge/[id]">) {
  const { id } = await params;
  const isNew = id === "new";
  if (!isNew && !uuid.safeParse(id).success) notFound();
  const { supabase, userId } = await requireUser();
  const [t, profile, ref] = await Promise.all([getT(), getProfile(supabase, userId), getRefData(supabase)]);
  const K = t.knowledge;

  let e: KnowledgeEntry | null = null;
  if (!isNew) {
    const { data } = await supabase.from("knowledge_entries").select("*").eq("id", id).maybeSingle();
    if (!data) notFound();
    e = data as KnowledgeEntry;
  }

  // Related trades: explicit links + automatic matches (concept flag, strategy, tag).
  let related: TradeListRow[] = [];
  let linkedIds = new Set<string>();
  let recent: TradeListRow[] = [];
  if (e) {
    const links = await supabase.from("knowledge_trade_links").select("trade_id").eq("entry_id", e.id);
    linkedIds = new Set((links.data ?? []).map((l) => l.trade_id as string));
    let tagTradeIds: string[] = [];
    if (e.tag_id) {
      const tt = await supabase.from("trade_tags").select("trade_id").eq("tag_id", e.tag_id);
      tagTradeIds = (tt.data ?? []).map((r) => r.trade_id as string);
    }
    const ors = [
      linkedIds.size ? `id.in.(${[...linkedIds].join(",")})` : null,
      e.concept_key ? `${e.concept_key}.is.true` : null,
      e.strategy_id ? `strategy_id.eq.${e.strategy_id}` : null,
      tagTradeIds.length ? `id.in.(${tagTradeIds.join(",")})` : null,
    ].filter(Boolean);
    if (ors.length) {
      related = await fetchAll<TradeListRow>((from, to) => supabase.from("trades").select(TRADE_LIST_COLUMNS).eq("is_sample", false).or(ors.join(","))
        .order("trade_date", { ascending: false }).order("entry_time", { ascending: false }).range(from, to) as never, "related trades");
    }
    const r = await supabase.from("trades").select(TRADE_LIST_COLUMNS).eq("is_sample", false).order("trade_date", { ascending: false }).limit(100);
    recent = ((r.data ?? []) as unknown as TradeListRow[]).filter((x) => !linkedIds.has(x.id));
  }
  const s = summarize(related);
  const sym = new Map(ref.instruments.map((i) => [i.id, i.symbol]));
  const kinds = K.kinds as Record<string, string>;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <Link href="/knowledge" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" /> {K.title}</Link>
      <PageHeader title={e?.title ?? K.newEntry} subtitle={e ? kinds[e.kind] : K.newHint} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card title={K.content}>
          <ActionForm action={saveEntry} className="space-y-4">
            {e ? <input type="hidden" name="id" value={e.id} /> : null}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Field label={K.titleLabel}><input name="title" className="field" defaultValue={e?.title} required maxLength={200} placeholder={K.titlePh} /></Field>
              <Field label={K.kind}>
                <select name="kind" className="field" defaultValue={e?.kind ?? "concept"}>{KNOWLEDGE_KINDS.map((k) => <option key={k} value={k}>{kinds[k]}</option>)}</select>
              </Field>
            </div>
            <Field label={K.body} hint={K.bodyHint}>
              <textarea name="body" className="field min-h-[320px] font-mono text-[13px]" defaultValue={e?.body} placeholder={K.bodyPh} />
            </Field>
            <div className="rounded-2xl border border-line bg-surface-2 p-4">
              <div className="eyebrow mb-1">{K.autoLink}</div>
              <p className="mb-3 text-xs text-muted">{K.autoLinkHint}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={K.concept}>
                  <select name="concept_key" className="field" defaultValue={e?.concept_key ?? ""}>
                    <option value="">—</option>{ICT_KEYS.map((k) => <option key={k} value={k}>{t.labels.ict[k]}</option>)}
                  </select>
                </Field>
                <Field label={t.form.strategy}>
                  <select name="strategy_id" className="field" defaultValue={e?.strategy_id ?? ""}>
                    <option value="">—</option>{ref.strategies.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </Field>
                <Field label={K.tag}>
                  <select name="tag_id" className="field" defaultValue={e?.tag_id ?? ""}>
                    <option value="">—</option>{ref.tags.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </Field>
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" name="pinned" defaultChecked={e?.pinned} className="h-4 w-4 accent-[var(--accent)]" /> {K.pin}
            </label>
            <div><SubmitButton className="btn-primary">{e ? t.common.save : K.create}</SubmitButton></div>
          </ActionForm>
          {e ? (
            <form action={deleteEntry} className="mt-4 border-t border-line pt-4">
              <input type="hidden" name="id" value={e.id} />
              <SubmitButton className="btn-ghost btn-sm text-loss" confirm={K.deleteConfirm} confirmLabel={K.deleteBtn}>{K.deleteBtn}</SubmitButton>
            </form>
          ) : null}
        </Card>

        {e ? (
          <div className="min-w-0 space-y-5">
            <Card title={K.performance} subtitle={fmt(K.performanceHint, { n: related.length })}>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                <Metric label={t.dashboard.totalTrades} value={s.totalTrades} />
                <Metric label={t.dashboard.netPnl} value={fmtMoney(s.netPnl, profile.currency, true)} tone={pnlTone(s.netPnl)} />
                <Metric label={t.dashboard.winRate} value={fmtPct(s.winRate)} />
                <Metric label={t.dashboard.avgR} value={fmtR(s.avgR)} tone={pnlTone(s.avgR)} />
              </div>
              {s.closedTrades > 0 && s.closedTrades < 10 ? <p className="mt-3 text-xs text-warn">{fmt(t.dashboard.tooFew, { n: s.closedTrades, m: 30 })}</p> : null}
            </Card>
            <Card title={K.linkTitle} subtitle={K.linkHint}>
              <ActionForm action={linkTrade} className="flex flex-wrap gap-2">
                <input type="hidden" name="entry_id" value={e.id} />
                <select name="trade_id" className="field min-w-0 flex-1" required defaultValue="">
                  <option value="" disabled>{K.chooseTrade}</option>
                  {recent.map((x) => <option key={x.id} value={x.id}>{x.trade_date} · {sym.get(x.instrument_id)} · {x.direction} · {fmtMoney(x.net_pnl, "USD", true)}</option>)}
                </select>
                <SubmitButton className="btn-primary"><Link2 className="h-4 w-4" /> {K.link}</SubmitButton>
              </ActionForm>
              {linkedIds.size ? (
                <ul className="mt-3 divide-y divide-line text-sm">
                  {related.filter((x) => linkedIds.has(x.id)).map((x) => (
                    <li key={x.id} className="flex items-center justify-between gap-2 py-2">
                      <Link href={`/journal/${x.id}`} className="hover:text-accent">{x.trade_date} · {sym.get(x.instrument_id)} · {fmtMoney(x.net_pnl, "USD", true)}</Link>
                      <ActionForm action={unlinkTrade}>
                        <input type="hidden" name="entry_id" value={e.id} /><input type="hidden" name="trade_id" value={x.id} />
                        <SubmitButton className="btn-sm btn-ghost text-faint">{K.unlink}</SubmitButton>
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          </div>
        ) : null}
      </div>

      {e ? (
        <Card title={K.relatedTrades} subtitle={K.relatedHint} flush>
          {related.length ? (
            <TradeTable rows={related} compact tz={profile.trading_timezone} symbols={Object.fromEntries(sym)}
              accounts={Object.fromEntries(ref.accounts.map((a) => [a.id, a.name]))} strategies={Object.fromEntries(ref.strategies.map((x) => [x.id, x.name]))} />
          ) : <p className="px-5 pb-5 text-sm text-faint">{K.noRelated}</p>}
        </Card>
      ) : null}
    </div>
  );
}
