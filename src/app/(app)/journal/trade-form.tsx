"use client";
import Link from "next/link";
import { startTransition, useActionState, useMemo, useState, type FormEvent } from "react";
import { Field, Notice, cx } from "@/components/ui";
import {
  ACCOUNT_TO_TRADE_TYPE, BIASES, ICT_FLAGS, KEY_LEVELS, PREMIUM_DISCOUNT, PSYCH_FLAGS, SESSIONS, SESSION_LABELS,
  TAG_CATEGORIES, TAG_CATEGORY_LABELS, TRADE_TYPES, TRADE_TYPE_LABELS,
} from "@/lib/constants";
import { calculateTrade, defaultExecutionFee, formatDuration } from "@/lib/calc/trade";
import type { Account, CustomFieldDefinition, Instrument, Strategy, Tag, TradeRow } from "@/lib/db/types";
import { fmtMoney, fmtNum, fmtPrice, fmtR, titleCase } from "@/lib/format";
import { classifySession, zonedTimeToUtc } from "@/lib/time/zone";
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

function TriSelect({ name, label, value }: { name: string; label: string; value: boolean | null | undefined }) {
  return (
    <label className="flex items-center justify-between gap-2 py-1">
      <span className="text-sm">{label}</span>
      <select name={name} defaultValue={triValue(value)} className="field w-28 flex-none py-1">
        <option value="">—</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="card group">
      <summary className="flex cursor-pointer list-none items-center justify-between border-b border-line px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wider text-muted group-not-open:border-b-0">
        {title}
        <span className="text-faint group-open:rotate-90">›</span>
      </summary>
      <div className="p-4">{children}</div>
    </details>
  );
}

export function TradeForm(p: Props) {
  const t = p.trade;
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
    if (!instrument) return { error: "Select an instrument." } as const;
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
  }, [payload, instrument, stopLoss, riskOverride, adjFees, p.tradingTz]);

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
        Create a trading account first (e.g. “Backtesting”) in <Link className="underline" href="/settings/accounts">Settings → Accounts</Link>.
      </Notice>
    );
  }

  return (
    <form action={action} onSubmit={submit} className="space-y-4" aria-busy={pending}>
      {t ? <input type="hidden" name="id" value={t.id} /> : null}
      <input type="hidden" name="executions" value={JSON.stringify(payload)} />
      {t && t.source !== "manual" ? (
        <Notice tone="warn">This trade was imported from {t.source}. Editing executions here will diverge from the source record.</Notice>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="card p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Account">
                <select name="account_id" className="field" value={accountId} onChange={(e) => {
                  setAccountId(e.target.value);
                  const acc = p.accounts.find((a) => a.id === e.target.value);
                  if (acc && !t) setTradeType(ACCOUNT_TO_TRADE_TYPE[acc.account_type]);
                }}>
                  {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_sample ? " (sample)" : ""}</option>)}
                </select>
              </Field>
              <Field label="Trade type">
                <select name="trade_type" className="field" value={tradeType} onChange={(e) => setTradeType(e.target.value)}>
                  {TRADE_TYPES.map((x) => <option key={x} value={x}>{TRADE_TYPE_LABELS[x]}</option>)}
                </select>
              </Field>
              <Field label="Instrument">
                <select name="instrument_id" className="field" value={instrumentId} onChange={(e) => changeInstrument(e.target.value)}>
                  {activeInstruments.map((i) => <option key={i.id} value={i.id}>{i.symbol} — ${fmtNum(Number(i.point_value))}/pt</option>)}
                </select>
              </Field>
              <Field label="Direction">
                <div className="grid grid-cols-2 gap-1 rounded-md border border-line p-0.5">
                  {(["long", "short"] as const).map((d) => (
                    <button key={d} type="button" onClick={() => setDirection(d)}
                      className={cx("rounded px-2 py-1 text-sm font-medium", direction === d ? (d === "long" ? "bg-profit/20 text-profit" : "bg-loss/20 text-loss") : "text-muted hover:text-fg")}>
                      {d === "long" ? "Long" : "Short"}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Trade date" hint={dateAuto ? "From first entry" : undefined}>
                <input type="date" name="trade_date" className="field" value={tradeDate} required onChange={(e) => { setTradeDate(e.target.value); setDateAuto(false); }} />
              </Field>
              <Field label="Session" hint={sessionAuto ? "Suggested from entry time" : undefined}>
                <select name="session" className="field" value={session} onChange={(e) => { setSession(e.target.value); setSessionAuto(false); }}>
                  <option value="">—</option>
                  {SESSIONS.map((s) => <option key={s} value={s}>{SESSION_LABELS[s]}</option>)}
                </select>
              </Field>
              <Field label="Strategy / setup">
                <select name="strategy_id" className="field" defaultValue={t?.strategy_id ?? ""}>
                  <option value="">None</option>
                  {p.strategies.filter((s) => s.is_active || s.id === t?.strategy_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Kill zone">
                <input name="kill_zone" className="field" defaultValue={t?.kill_zone ?? ""} placeholder="e.g. NY AM 08:30–11:00" />
              </Field>
            </div>
          </section>

          <section className="card">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <h2 className="text-[12px] font-semibold uppercase tracking-wider text-muted">
                Executions <span className="normal-case tracking-normal text-faint">· times in {p.tradingTz}</span>
              </h2>
              <div className="flex gap-2">
                <button type="button" className="btn btn-sm" onClick={() => addRow("entry")}>+ Entry (scale in)</button>
                <button type="button" className="btn btn-sm" onClick={() => addRow("exit")}>+ Exit (partial)</button>
              </div>
            </header>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>Type</th><th>Side</th><th>Date & time</th><th>Contracts</th><th>Price</th><th>Fees $</th><th /></tr>
                </thead>
                <tbody>
                  {execs.map((e) => (
                    <tr key={e.key}>
                      <td>
                        <select className="field w-20 py-1" value={e.kind} onChange={(ev) => update(e.key, { kind: ev.target.value as ExecDraft["kind"] })} aria-label="Entry or exit">
                          <option value="entry">Entry</option>
                          <option value="exit">Exit</option>
                        </select>
                      </td>
                      <td className={cx("num text-xs font-semibold uppercase", sideOf(e.kind) === "buy" ? "text-profit" : "text-loss")}>{sideOf(e.kind)}</td>
                      <td><input type="datetime-local" step={1} className="field w-48 py-1" value={e.local} onChange={(ev) => update(e.key, { local: ev.target.value })} required aria-label="Execution time" /></td>
                      <td><input className="field num w-16 py-1" inputMode="numeric" value={e.quantity} onChange={(ev) => update(e.key, { quantity: ev.target.value })} required aria-label="Contracts" /></td>
                      <td><input className="field num w-28 py-1" inputMode="decimal" value={e.price} onChange={(ev) => update(e.key, { price: ev.target.value })} placeholder="0.00" required aria-label="Price" /></td>
                      <td>
                        <input className={cx("field num w-24 py-1", e.feeAuto && "text-muted")} inputMode="decimal" value={e.fees} onChange={(ev) => update(e.key, { fees: ev.target.value })} aria-label="Fees" title={e.feeAuto ? "Auto: contracts × instrument per-side commission + fees" : "Manually set"} />
                      </td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm text-faint" disabled={execs.length === 1} onClick={() => setExecs((prev) => prev.filter((x) => x.key !== e.key))} aria-label="Remove execution">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <Section title="Risk plan">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Stop-loss"><input name="stop_loss" className="field num" inputMode="decimal" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} /></Field>
              <Field label="Take-profit"><input name="take_profit" className="field num" inputMode="decimal" defaultValue={t?.take_profit ?? ""} /></Field>
              <Field label="Planned risk $ (override)" hint="Blank = |avg entry − stop| × max contracts × $/pt">
                <input name="planned_risk_override" className="field num" inputMode="decimal" value={riskOverride} onChange={(e) => setRiskOverride(e.target.value)} />
              </Field>
              <Field label="Other fees $" hint="Extra fees not on any fill (added once)">
                <input name="adjustment_fees" className="field num" inputMode="decimal" value={adjFees} onChange={(e) => setAdjFees(e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title="Market analysis (ICT & context)">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Daily bias">
                <select name="daily_bias" className="field" defaultValue={t?.daily_bias ?? ""}>
                  <option value="">—</option>{BIASES.map((b) => <option key={b} value={b}>{titleCase(b)}</option>)}
                </select>
              </Field>
              <Field label="Higher-timeframe bias">
                <select name="htf_bias" className="field" defaultValue={t?.htf_bias ?? ""}>
                  <option value="">—</option>{BIASES.map((b) => <option key={b} value={b}>{titleCase(b)}</option>)}
                </select>
              </Field>
              <Field label="Premium / discount">
                <select name="premium_discount" className="field" defaultValue={t?.premium_discount ?? ""}>
                  <option value="">—</option>{PREMIUM_DISCOUNT.map((b) => <option key={b} value={b}>{titleCase(b)}</option>)}
                </select>
              </Field>
              <Field label="Market structure"><input name="market_structure" className="field" defaultValue={t?.market_structure ?? ""} placeholder="e.g. bullish, HH/HL" /></Field>
              {KEY_LEVELS.map(([k, label]) => (
                <Field key={k} label={label}><input name={k} className="field num" inputMode="decimal" defaultValue={t?.[k] ?? ""} /></Field>
              ))}
              <Field label="Buy-side liquidity" className="sm:col-span-2"><input name="buy_side_liquidity" className="field" defaultValue={t?.buy_side_liquidity ?? ""} placeholder="e.g. equal highs above PDH" /></Field>
              <Field label="Sell-side liquidity" className="sm:col-span-2"><input name="sell_side_liquidity" className="field" defaultValue={t?.sell_side_liquidity ?? ""} /></Field>
              <Field label="Entry confirmation" className="sm:col-span-2 lg:col-span-4"><input name="entry_confirmation" className="field" defaultValue={t?.entry_confirmation ?? ""} placeholder="What confirmed the entry?" /></Field>
            </div>
            <div className="mt-3 grid gap-x-8 sm:grid-cols-2">
              {ICT_FLAGS.map(([k, label]) => <TriSelect key={k} name={k} label={label} value={t?.[k]} />)}
            </div>
            <Field label="Analysis notes" className="mt-3">
              <textarea name="analysis_notes" className="field" defaultValue={t?.analysis_notes ?? ""} placeholder="What did you observe? Why did you take this trade?" />
            </Field>
          </Section>

          <Section title="Psychology & execution">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Emotion before"><input name="emotion_before" className="field" defaultValue={t?.emotion_before ?? ""} placeholder="calm, anxious, FOMO…" /></Field>
              <Field label="Emotion during"><input name="emotion_during" className="field" defaultValue={t?.emotion_during ?? ""} /></Field>
              <Field label="Emotion after"><input name="emotion_after" className="field" defaultValue={t?.emotion_after ?? ""} /></Field>
              <Field label="Confidence (1–10)">
                <select name="confidence" className="field" defaultValue={t?.confidence ?? ""}>
                  <option value="">—</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                </select>
              </Field>
            </div>
            <div className="mt-3 grid gap-x-8 sm:grid-cols-2">
              {PSYCH_FLAGS.map(([k, label]) => <TriSelect key={k} name={k} label={label} value={t?.[k]} />)}
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <Field label="Mistakes"><textarea name="mistakes" className="field" defaultValue={t?.mistakes ?? ""} /></Field>
              <Field label="Lessons learned"><textarea name="lessons" className="field" defaultValue={t?.lessons ?? ""} /></Field>
            </div>
          </Section>

          {p.tags.length || p.customFields.some((c) => c.is_active) ? (
            <Section title="Tags & custom fields">
              {TAG_CATEGORIES.map((cat) => {
                const list = p.tags.filter((x) => x.category === cat);
                if (!list.length) return null;
                return (
                  <div key={cat} className="mb-3">
                    <div className="label">{TAG_CATEGORY_LABELS[cat]}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((tag) => (
                        <label key={tag.id} className="cursor-pointer">
                          <input type="checkbox" name="tag_ids" value={tag.id} defaultChecked={selectedTags.has(tag.id)} className="peer sr-only" />
                          <span className="inline-flex items-center gap-1.5 rounded border border-line px-2 py-1 text-xs text-muted peer-checked:border-accent peer-checked:text-fg peer-focus-visible:ring-1 peer-focus-visible:ring-accent">
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
                          <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
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

          <Section title="Notes">
            <textarea name="notes" className="field min-h-[120px]" defaultValue={t?.notes ?? ""} placeholder="Anything else about this trade…" />
          </Section>
        </div>

        <aside className="space-y-3 xl:sticky xl:top-5 xl:self-start">
          <section className="card p-4">
            <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-muted">Calculated</h2>
            {"error" in preview ? (
              <p className="text-sm text-warn">{preview.error}</p>
            ) : (
              <dl className="num space-y-1.5 text-sm">
                {[
                  ["Status", preview.calc.status === "open" ? `Open (${preview.calc.openQuantity} left)` : "Closed"],
                  ["Avg entry", fmtPrice(preview.calc.avgEntryPrice)],
                  ["Avg exit", fmtPrice(preview.calc.avgExitPrice)],
                  ["Max contracts", String(preview.calc.maxPosition)],
                  ["Points / contract", fmtNum(preview.calc.points, 4)],
                ].map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>)}
                <div className="my-2 border-t border-line" />
                <div className="flex justify-between"><dt className="text-muted">Gross P/L</dt><dd className={preview.calc.grossPnl >= 0 ? "text-profit" : "text-loss"}>{fmtMoney(preview.calc.grossPnl)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Fees</dt><dd>{preview.calc.totalFees ? `−${fmtMoney(preview.calc.totalFees)}` : fmtMoney(0)}</dd></div>
                <div className="flex justify-between text-base font-semibold"><dt>Net P/L</dt><dd className={preview.calc.netPnl > 0 ? "text-profit" : preview.calc.netPnl < 0 ? "text-loss" : ""}>{fmtMoney(preview.calc.netPnl)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Planned risk</dt><dd>{fmtMoney(preview.calc.plannedRisk)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">R multiple</dt><dd>{fmtR(preview.calc.rMultiple)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Duration</dt><dd>{formatDuration(preview.calc.holdingSeconds)}</dd></div>
              </dl>
            )}
            {instrument ? (
              <p className="mt-3 text-[11px] text-faint">
                {instrument.symbol}: ${fmtNum(Number(instrument.point_value))}/point, tick {fmtNum(Number(instrument.tick_size), 6)} = ${fmtNum(Number(instrument.tick_value), 4)}.
                The server recalculates on save.
              </p>
            ) : null}
          </section>
          {state.error ? <Notice tone="error">{state.error}</Notice> : null}
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary flex-1" disabled={pending}>{pending ? "Saving…" : t ? "Save changes" : "Save trade"}</button>
            <Link href={t ? `/journal/${t.id}` : "/journal"} className="btn">Cancel</Link>
          </div>
        </aside>
      </div>
    </form>
  );
}
