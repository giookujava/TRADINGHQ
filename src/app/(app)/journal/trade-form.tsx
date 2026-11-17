"use client";
import { Brain, ChartCandlestick, ChevronDown, ListChecks, NotebookPen, Plus, Shield, Tag as TagIcon, Trash2, Info } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useMemo, useState, type FormEvent } from "react";
import { Field, Notice, cx } from "@/components/ui";
import {
  ACCOUNT_TO_TRADE_TYPE, BIASES, ICT_FLAGS, KEY_LEVELS, PREMIUM_DISCOUNT, PSYCH_FLAGS, SESSIONS,
  TAG_CATEGORIES, TRADE_TYPES,
} from "@/lib/constants";
import { calculateTrade, defaultExecutionFee, formatDuration } from "@/lib/calc/trade";
import type { Account, CustomFieldDefinition, Instrument, Strategy, Tag, TradeRow } from "@/lib/db/types";
import { fmtMoney, fmtNum, fmtPrice, fmtR } from "@/lib/format";
import { classifySession, zonedTimeToUtc } from "@/lib/time/zone";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import type { ActionResult } from "@/lib/validation/common";
import { saveTrade } from "./actions";

export interface ExecDraft {
  key: string;
  kind: "entry" | "exit";
  local: string; // YYYY-MM-DDTHH:mm:ss in trading tz
  quantity: string;
  price: string;
  fees: string;
  feeAuto: boolean;
}

interface Props {
  trade?: TradeRow;
  initialExecutions?: ExecDraft[];
  initialTagIds?: string[];
  accounts: Account[];
  instruments: Instrument[];
  strategies: Strategy[];
  tags: Tag[];
  customFields: CustomFieldDefinition[];
  tradingTz: string;
  defaultInstrumentId: string | null;
  today: string;
  nowLocal: string;
}

let keySeq = 0;
const newKey = () => `e${++keySeq}${Math.random().toString(36).slice(2, 6)}`;
const triValue = (v: boolean | null | undefined) => (v === true ? "yes" : v === false ? "no" : "");

/** Three-state toggle: not recorded / yes / no (radio group, posts "", "yes" or "no"). */
function TriSelect({ name, label, value }: { name: string; label: string; value: boolean | null | undefined }) {
  const L = useT();
  const initial = triValue(value);
  return (
    <fieldset className="flex items-center justify-between gap-3 py-1.5">
      <legend className="sr-only">{label}</legend>
      <span className="text-sm" aria-hidden>{label}</span>
      <div className="inline-flex shrink-0 rounded-lg border border-line bg-surface-2 p-0.5">
        {([["", "—"], ["yes", L.common.yes], ["no", L.common.no]] as const).map(([v, l]) => (
          <label key={v} className="cursor-pointer">
            <input type="radio" name={name} value={v} defaultChecked={initial === v} className="peer sr-only" />
            <span className="block rounded-md px-2.5 py-1 text-xs font-medium text-muted transition-colors peer-checked:bg-surface peer-checked:text-fg peer-checked:shadow-card peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ring)]">
              {l}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Section({ title, description, icon, children, defaultOpen = true }: {
  title: string; description?: string; icon?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="card group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="flex items-start gap-2.5">
          {icon ? <span className="mt-0.5 text-faint">{icon}</span> : null}
          <span>
            <span className="block text-base font-bold">{title}</span>
            {description ? <span className="mt-0.5 block text-xs font-normal text-muted">{description}</span> : null}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-faint transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-line px-5 py-5">{children}</div>
    </details>
  );
}

export function TradeForm(p: Props) {
  const t = p.trade;
  const L = useT();
  const F = L.form;
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveTrade, {});

  const activeAccounts = p.accounts.filter((a) => a.is_active || a.id === t?.account_id);
  const activeInstruments = p.instruments.filter((i) => i.is_active || i.id === t?.instrument_id);

  const [accountId, setAccountId] = useState(t?.account_id ?? activeAccounts.find((a) => !a.is_sample)?.id ?? activeAccounts[0]?.id ?? "");
  const [tradeType, setTradeType] = useState<string>(
    t?.trade_type ?? ACCOUNT_TO_TRADE_TYPE[activeAccounts.find((a) => a.id === accountId)?.account_type ?? "backtest"],
  );
  const [instrumentId, setInstrumentId] = useState(
    t?.instrument_id ??
      (activeInstruments.some((i) => i.id === p.defaultInstrumentId)
        ? p.defaultInstrumentId!
        : (activeInstruments.find((i) => i.symbol === "MNQ") ?? activeInstruments[0])?.id ?? ""),
  );
  const instrument = p.instruments.find((i) => i.id === instrumentId);
  const [direction, setDirection] = useState<"long" | "short">(t?.direction ?? "long");
  const [stopLoss, setStopLoss] = useState(t?.stop_loss != null ? String(t.stop_loss) : "");
  const [riskOverride, setRiskOverride] = useState(t?.planned_risk_override != null ? String(t.planned_risk_override) : "");
  const [adjFees, setAdjFees] = useState(t?.adjustment_fees ? String(t.adjustment_fees) : "");

  const feeFor = (qty: string, inst = instrument) =>
    inst && Number(qty) > 0
      ? String(defaultExecutionFee(Number(qty), { commissionPerSide: Number(inst.commission_per_side), exchangeFeePerSide: Number(inst.exchange_fee_per_side) }))
      : "0";

  const [execs, setExecs] = useState<ExecDraft[]>(
    p.initialExecutions?.length
      ? p.initialExecutions
      : [
          { key: newKey(), kind: "entry", local: p.nowLocal, quantity: "1", price: "", fees: feeFor("1"), feeAuto: true },
          { key: newKey(), kind: "exit", local: p.nowLocal, quantity: "1", price: "", fees: feeFor("1"), feeAuto: true },
        ],
  );

  const [tradeDate, setTradeDate] = useState(t?.trade_date ?? p.today);
  const [dateAuto, setDateAuto] = useState(!t);
  const [session, setSession] = useState<string>(() => {
    if (t) return t.session ?? "";
    try {
      return classifySession(zonedTimeToUtc(p.nowLocal, p.tradingTz));
    } catch {
      return "";
    }
  });
  const [sessionAuto, setSessionAuto] = useState(!t);

  const sideOf = (kind: ExecDraft["kind"]) =>
    (direction === "long") === (kind === "entry") ? ("buy" as const) : ("sell" as const);

  function syncAuto(next: ExecDraft[]) {
    const first = [...next].filter((e) => e.local).sort((a, b) => a.local.localeCompare(b.local))[0];
    if (!first) return;
    if (dateAuto) setTradeDate(first.local.slice(0, 10));
    if (sessionAuto) {
      try {
        setSession(classifySession(zonedTimeToUtc(first.local, p.tradingTz)));
      } catch { /* incomplete time */ }
    }
  }

  function update(key: string, patch: Partial<ExecDraft>) {
    setExecs((prev) => {
      const next = prev.map((e) => {
        if (e.key !== key) return e;
        const merged = { ...e, ...patch };
        if ("fees" in patch) merged.feeAuto = false;
        if ("quantity" in patch && merged.feeAuto) merged.fees = feeFor(merged.quantity);
        return merged;
      });
      if ("local" in patch) syncAuto(next);
      return next;
    });
  }

  function addRow(kind: ExecDraft["kind"]) {
    setExecs((prev) => {
      const last = prev[prev.length - 1];
      return [...prev, { key: newKey(), kind, local: last?.local ?? p.nowLocal, quantity: "1", price: "", fees: feeFor("1"), feeAuto: true }];
    });
  }

  function changeInstrument(id: string) {
    setInstrumentId(id);
    const inst = p.instruments.find((i) => i.id === id);
    setExecs((prev) => prev.map((e) => (e.feeAuto ? { ...e, fees: feeFor(e.quantity, inst) } : e)));
  }

  const payload = useMemo(
    () =>
      execs.map((e) => ({
        executed_local: e.local.length === 16 ? `${e.local}:00` : e.local,
        side: sideOf(e.kind),
        quantity: Number(e.quantity),
        price: Number(e.price),
        fees: Number(e.fees || 0),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [execs, direction],
  );

  const preview = useMemo(() => {
    if (!instrument) return { error: F.selectInstrument } as const;
    try {
      const calc = calculateTrade({
        instrument: { pointValue: Number(instrument.point_value) },
        executions: payload.map((e) => ({
          executedAt: zonedTimeToUtc(e.executed_local, p.tradingTz).toISOString(),
          side: e.side, quantity: e.quantity, price: e.price, fees: e.fees,
        })),
        stopLoss: stopLoss ? Number(stopLoss) : null,
        plannedRiskOverride: riskOverride ? Number(riskOverride) : null,
        adjustmentFees: adjFees ? Number(adjFees) : 0,
      });
      return { calc } as const;
    } catch (e) {
      return { error: (e as Error).message } as const;
    }
  }, [payload, instrument, stopLoss, riskOverride, adjFees, p.tradingTz, F]);

  const selectedTags = new Set(p.initialTagIds ?? []);

  // Submit manually so React does not auto-reset uncontrolled fields when the server returns an error.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  }

  if (!activeAccounts.length) {
    return (
      <Notice tone="warn">
        {F.needAccount} <Link className="underline" href="/settings/accounts">{F.settingsAccounts}</Link>.
      </Notice>
    );
  }

  return (
    <form action={action} onSubmit={submit} className="space-y-4" aria-busy={pending}>
      {t ? <input type="hidden" name="id" value={t.id} /> : null}
      <input type="hidden" name="executions" value={JSON.stringify(payload)} />
      {t && t.source !== "manual" ? (
        <Notice tone="warn">{fmt(F.importedWarn, { s: t.source })}</Notice>
      ) : null}

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <section className="card p-5">
            <div className="mb-4 flex items-start gap-2.5">
              <Info className="mt-0.5 h-4 w-4 text-faint" aria-hidden />
              <div>
                <h2 className="text-base font-bold">{F.setup}</h2>
                <p className="mt-0.5 text-xs text-muted">{F.setupHint}</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={F.account}>
                <select name="account_id" className="field" value={accountId} onChange={(e) => {
                  setAccountId(e.target.value);
                  const acc = p.accounts.find((a) => a.id === e.target.value);
                  if (acc && !t) setTradeType(ACCOUNT_TO_TRADE_TYPE[acc.account_type]);
                }}>
                  {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_sample ? ` (${L.common.sample})` : ""}</option>)}
                </select>
              </Field>
              <Field label={F.tradeType}>
                <select name="trade_type" className="field" value={tradeType} onChange={(e) => setTradeType(e.target.value)}>
                  {TRADE_TYPES.map((x) => <option key={x} value={x}>{L.labels.tradeTypes[x]}</option>)}
                </select>
              </Field>
              <Field label={F.instrument}>
                <select name="instrument_id" className="field" value={instrumentId} onChange={(e) => changeInstrument(e.target.value)}>
                  {activeInstruments.map((i) => <option key={i.id} value={i.id}>{i.symbol} — ${fmtNum(Number(i.point_value))}/pt</option>)}
                </select>
              </Field>
              <Field label={F.direction}>
                <div className="grid h-[38px] grid-cols-2 gap-1 rounded-xl border border-line-strong bg-surface-2 p-1" role="radiogroup" aria-label={F.direction}>
                  {(["long", "short"] as const).map((d) => (
                    <button key={d} type="button" role="radio" aria-checked={direction === d} onClick={() => setDirection(d)}
                      className={cx("rounded-lg text-sm font-bold transition-colors", direction === d ? (d === "long" ? "bg-profit-soft text-profit shadow-card" : "bg-loss-soft text-loss shadow-card") : "text-muted hover:text-fg")}>
                      {d === "long" ? "▲ Long" : "▼ Short"}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={F.tradeDate} hint={dateAuto ? F.fromFirstEntry : undefined}>
                <input type="date" name="trade_date" className="field" value={tradeDate} required onChange={(e) => { setTradeDate(e.target.value); setDateAuto(false); }} />
              </Field>
              <Field label={F.session} hint={sessionAuto ? F.suggested : undefined}>
                <select name="session" className="field" value={session} onChange={(e) => { setSession(e.target.value); setSessionAuto(false); }}>
                  <option value="">—</option>
                  {SESSIONS.map((s) => <option key={s} value={s}>{L.labels.sessions[s]}</option>)}
                </select>
              </Field>
              <Field label={F.strategy}>
                <select name="strategy_id" className="field" defaultValue={t?.strategy_id ?? ""}>
                  <option value="">{L.common.none}</option>
                  {p.strategies.filter((s) => s.is_active || s.id === t?.strategy_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label={F.killZone}>
                <input name="kill_zone" className="field" defaultValue={t?.kill_zone ?? ""} placeholder={F.killZonePh} />
              </Field>
            </div>
          </section>

          <section className="card">
            <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
              <div className="flex items-start gap-2.5">
                <ListChecks className="mt-0.5 h-4 w-4 text-faint" aria-hidden />
                <div>
                  <h2 className="text-base font-bold">{F.executions}</h2>
                  <p className="mt-0.5 text-xs text-muted">{fmt(F.executionsHint, { z: p.tradingTz })}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn btn-sm" onClick={() => addRow("entry")}><Plus className="h-3.5 w-3.5" /> {F.addEntry} <span className="text-faint">{F.scaleIn}</span></button>
                <button type="button" className="btn btn-sm" onClick={() => addRow("exit")}><Plus className="h-3.5 w-3.5" /> {F.addExit} <span className="text-faint">{F.partial}</span></button>
              </div>
            </header>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>{F.colType}</th><th>{F.colSide}</th><th>{F.colTime}</th><th>{F.colContracts}</th><th>{F.colPrice}</th><th>{F.colFees}</th><th /></tr>
                </thead>
                <tbody>
                  {execs.map((e) => (
                    <tr key={e.key}>
                      <td>
                        <select className="field w-[92px] py-1" value={e.kind} onChange={(ev) => update(e.key, { kind: ev.target.value as ExecDraft["kind"] })} aria-label={F.colType}>
                          <option value="entry">{F.entryOpt}</option>
                          <option value="exit">{F.exitOpt}</option>
                        </select>
                      </td>
                      <td className={cx("num text-xs font-semibold uppercase", sideOf(e.kind) === "buy" ? "text-profit" : "text-loss")}>{sideOf(e.kind)}</td>
                      <td><input type="datetime-local" step={1} className="field w-48 py-1" value={e.local} onChange={(ev) => update(e.key, { local: ev.target.value })} required aria-label={F.colTime} /></td>
                      <td><input className="field num w-16 py-1" inputMode="numeric" value={e.quantity} onChange={(ev) => update(e.key, { quantity: ev.target.value })} required aria-label={F.colContracts} /></td>
                      <td><input className="field num w-28 py-1" inputMode="decimal" value={e.price} onChange={(ev) => update(e.key, { price: ev.target.value })} placeholder="0.00" required aria-label={F.colPrice} /></td>
                      <td>
                        <input className={cx("field num w-24 py-1", e.feeAuto && "text-muted")} inputMode="decimal" value={e.fees} onChange={(ev) => update(e.key, { fees: ev.target.value })} aria-label={F.colFees} title={e.feeAuto ? F.feeAuto : F.feeManual} />
                      </td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm text-faint hover:text-loss" disabled={execs.length === 1} onClick={() => setExecs((prev) => prev.filter((x) => x.key !== e.key))} aria-label={F.removeExec}><Trash2 className="h-3.5 w-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <Section title={F.riskPlan} icon={<Shield className="h-4 w-4" />} description={F.riskPlanHint}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={F.stopLoss}><input name="stop_loss" className="field num" inputMode="decimal" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} /></Field>
              <Field label={F.takeProfit}><input name="take_profit" className="field num" inputMode="decimal" defaultValue={t?.take_profit ?? ""} /></Field>
              <Field label={F.riskOverride} hint={F.riskOverrideHint}>
                <input name="planned_risk_override" className="field num" inputMode="decimal" value={riskOverride} onChange={(e) => setRiskOverride(e.target.value)} />
              </Field>
              <Field label={F.otherFees} hint={F.otherFeesHint}>
                <input name="adjustment_fees" className="field num" inputMode="decimal" value={adjFees} onChange={(e) => setAdjFees(e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title={F.market} icon={<ChartCandlestick className="h-4 w-4" />} description={F.marketHint}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={F.dailyBias}>
                <select name="daily_bias" className="field" defaultValue={t?.daily_bias ?? ""}>
                  <option value="">—</option>{BIASES.map((b) => <option key={b} value={b}>{L.labels.bias[b]}</option>)}
                </select>
              </Field>
              <Field label={F.htfBias}>
                <select name="htf_bias" className="field" defaultValue={t?.htf_bias ?? ""}>
                  <option value="">—</option>{BIASES.map((b) => <option key={b} value={b}>{L.labels.bias[b]}</option>)}
                </select>
              </Field>
              <Field label={F.premiumDiscount}>
                <select name="premium_discount" className="field" defaultValue={t?.premium_discount ?? ""}>
                  <option value="">—</option>{PREMIUM_DISCOUNT.map((b) => <option key={b} value={b}>{L.labels.premium[b]}</option>)}
                </select>
              </Field>
              <Field label={F.marketStructure}><input name="market_structure" className="field" defaultValue={t?.market_structure ?? ""} placeholder={F.marketStructurePh} /></Field>
              {KEY_LEVELS.map(([k]) => (
                <Field key={k} label={L.labels.levels[k]}><input name={k} className="field num" inputMode="decimal" defaultValue={t?.[k] ?? ""} /></Field>
              ))}
              <Field label={F.bsl} className="sm:col-span-2"><input name="buy_side_liquidity" className="field" defaultValue={t?.buy_side_liquidity ?? ""} placeholder={F.bslPh} /></Field>
              <Field label={F.ssl} className="sm:col-span-2"><input name="sell_side_liquidity" className="field" defaultValue={t?.sell_side_liquidity ?? ""} /></Field>
              <Field label={F.entryConfirmation} className="sm:col-span-2 lg:col-span-4"><input name="entry_confirmation" className="field" defaultValue={t?.entry_confirmation ?? ""} placeholder={F.entryConfirmationPh} /></Field>
            </div>
            <div className="mt-5 grid gap-x-10 divide-line sm:grid-cols-2">
              {ICT_FLAGS.map(([k]) => <TriSelect key={k} name={k} label={L.labels.ict[k]} value={t?.[k]} />)}
            </div>
            <Field label={F.analysisNotes} className="mt-3">
              <textarea name="analysis_notes" className="field" defaultValue={t?.analysis_notes ?? ""} placeholder={F.analysisNotesPh} />
            </Field>
          </Section>

          <Section title={F.psychology} icon={<Brain className="h-4 w-4" />} description={F.psychologyHint}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={F.emotionBefore}><input name="emotion_before" className="field" defaultValue={t?.emotion_before ?? ""} placeholder={F.emotionBeforePh} /></Field>
              <Field label={F.emotionDuring}><input name="emotion_during" className="field" defaultValue={t?.emotion_during ?? ""} /></Field>
              <Field label={F.emotionAfter}><input name="emotion_after" className="field" defaultValue={t?.emotion_after ?? ""} /></Field>
              <Field label={F.confidence}>
                <select name="confidence" className="field" defaultValue={t?.confidence ?? ""}>
                  <option value="">—</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                </select>
              </Field>
            </div>
            <div className="mt-5 grid gap-x-10 divide-line sm:grid-cols-2">
              {PSYCH_FLAGS.map(([k]) => <TriSelect key={k} name={k} label={L.labels.psych[k]} value={t?.[k]} />)}
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <Field label={F.mistakes}><textarea name="mistakes" className="field" defaultValue={t?.mistakes ?? ""} /></Field>
              <Field label={F.lessons}><textarea name="lessons" className="field" defaultValue={t?.lessons ?? ""} /></Field>
            </div>
          </Section>

          {p.tags.length || p.customFields.some((c) => c.is_active) ? (
            <Section title={F.tags} icon={<TagIcon className="h-4 w-4" />}>
              {TAG_CATEGORIES.map((cat) => {
                const list = p.tags.filter((x) => x.category === cat);
                if (!list.length) return null;
                return (
                  <div key={cat} className="mb-3">
                    <div className="label">{L.labels.tagCategories[cat]}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((tag) => (
                        <label key={tag.id} className="cursor-pointer">
                          <input type="checkbox" name="tag_ids" value={tag.id} defaultChecked={selectedTags.has(tag.id)} className="peer sr-only" />
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-2.5 py-1 text-xs text-muted transition-colors peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-fg peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ring)]">
                            <span className="h-2 w-2 rounded-full" style={{ background: tag.color }} />{tag.name}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {p.customFields.filter((c) => c.is_active).map((c) => {
                  const v = t?.custom_fields?.[c.id];
                  const name = `cf:${c.id}`;
                  return (
                    <Field key={c.id} label={c.name}>
                      {c.field_type === "boolean" ? (
                        <select name={name} className="field" defaultValue={v === true ? "yes" : v === false ? "no" : ""}>
                          <option value="">—</option><option value="yes">{L.common.yes}</option><option value="no">{L.common.no}</option>
                        </select>
                      ) : c.field_type === "select" ? (
                        <select name={name} className="field" defaultValue={v == null ? "" : String(v)}>
                          <option value="">—</option>{c.options.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input name={name} className={cx("field", c.field_type === "number" && "num")} inputMode={c.field_type === "number" ? "decimal" : undefined} defaultValue={v == null ? "" : String(v)} />
                      )}
                    </Field>
                  );
                })}
              </div>
            </Section>
          ) : null}

          <Section title={F.notes} icon={<NotebookPen className="h-4 w-4" />}>
            <textarea name="notes" className="field min-h-[120px]" defaultValue={t?.notes ?? ""} placeholder={F.notesPh} />
          </Section>

          {/* Sticky action bar for screens where the summary panel is not beside the form */}
          <div className="sticky bottom-3 z-10 rounded-2xl border border-line bg-surface/90 px-4 py-3 shadow-pop backdrop-blur 2xl:hidden">
            {state.error ? <Notice tone="error" className="mb-2">{state.error}</Notice> : null}
            <div className="flex items-center justify-end gap-2">
              {preview.calc ? (
                <span className="mr-auto text-sm text-muted">{F.netShort} <span className={cx("num font-semibold", preview.calc.netPnl > 0 && "text-profit", preview.calc.netPnl < 0 && "text-loss")}>{fmtMoney(preview.calc.netPnl, "USD", true)}</span> · {fmtR(preview.calc.rMultiple)}</span>
              ) : <span className="mr-auto text-sm text-warn">{"error" in preview ? preview.error : ""}</span>}
              <Link href={t ? `/journal/${t.id}` : "/journal"} className="btn">{L.common.cancel}</Link>
              <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? L.common.saving : t ? F.saveChanges : F.saveTrade}</button>
            </div>
          </div>
        </div>

        <aside className="order-first space-y-3 2xl:sticky 2xl:top-32 2xl:order-none 2xl:self-start">
          <section className="card p-5">
            <h2 className="text-base font-bold">{F.live}</h2>
            <p className="mb-4 mt-0.5 text-xs text-muted">{F.liveHint}</p>
            {"error" in preview ? (
              <p className="text-sm text-warn">{preview.error}</p>
            ) : (
              <dl className="num grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3 lg:grid-cols-4 2xl:block 2xl:space-y-1.5">
                {[
                  [F.status, preview.calc.status === "open" ? fmt(F.openLeft, { n: preview.calc.openQuantity }) : F.closed],
                  [F.avgEntry, fmtPrice(preview.calc.avgEntryPrice)],
                  [F.avgExit, fmtPrice(preview.calc.avgExitPrice)],
                  [F.maxContracts, String(preview.calc.maxPosition)],
                  [F.pointsPer, fmtNum(preview.calc.points, 4)],
                ].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>)}
                <div className="col-span-full my-2 border-t border-line" />
                <div className="flex justify-between"><dt className="text-muted">{F.gross}</dt><dd className={preview.calc.grossPnl >= 0 ? "text-profit" : "text-loss"}>{fmtMoney(preview.calc.grossPnl)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">{F.fees}</dt><dd>{preview.calc.totalFees ? `−${fmtMoney(preview.calc.totalFees)}` : fmtMoney(0)}</dd></div>
                <div className="col-span-full my-1 flex items-baseline justify-between rounded-lg bg-surface-2 px-3 py-2.5 text-lg font-semibold 2xl:-mx-5 2xl:rounded-none 2xl:px-5"><dt className="font-sans text-sm">{F.net}</dt><dd className={preview.calc.netPnl > 0 ? "text-profit" : preview.calc.netPnl < 0 ? "text-loss" : ""}>{fmtMoney(preview.calc.netPnl, "USD", true)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">{F.plannedRisk}</dt><dd>{fmtMoney(preview.calc.plannedRisk)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">{F.rMultiple}</dt><dd>{fmtR(preview.calc.rMultiple)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">{F.duration}</dt><dd>{formatDuration(preview.calc.holdingSeconds)}</dd></div>
              </dl>
            )}
            {instrument ? (
              <p className="mt-3 text-[11px] text-faint">
                {fmt(F.instrumentSpec, { s: instrument.symbol, p: fmtNum(Number(instrument.point_value)), t: fmtNum(Number(instrument.tick_size), 6), v: fmtNum(Number(instrument.tick_value), 4) })}

              </p>
            ) : null}
          </section>
          <div className="hidden space-y-3 2xl:block">
            {state.error ? <Notice tone="error">{state.error}</Notice> : null}
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary flex-1" disabled={pending}>{pending ? L.common.saving : t ? F.saveChanges : F.saveTrade}</button>
              <Link href={t ? `/journal/${t.id}` : "/journal"} className="btn">{L.common.cancel}</Link>
            </div>
          </div>
        </aside>
      </div>
    </form>
  );
}
