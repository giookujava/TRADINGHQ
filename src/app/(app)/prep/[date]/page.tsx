import { ChevronLeft, ChevronRight, ClipboardCheck, Compass, Crosshair, List, Newspaper, Plus, Scale } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, DirectionBadge, Field, cx } from "@/components/ui";
import { BIASES, EXPECTED_DIRECTIONS, KEY_LEVELS, SESSIONS, SESSION_LABELS, VOLATILITY } from "@/lib/constants";
import { summarize } from "@/lib/calc/stats";
import type { DailyPrep } from "@/lib/db/types";
import { getProfile, getRefData, getTrades } from "@/lib/data/queries";
import { fmtMoney, fmtR, titleCase } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { formatInZone, todayInZone, tzAbbreviation } from "@/lib/time/zone";
import { isoDate } from "@/lib/validation/common";
import { deletePrep, savePrep } from "../actions";

export const metadata = { title: "Daily Preparation" };

const QUESTIONS = [
  ["q_where_to", "Where does the market want to go?", "Draw on liquidity — the target."],
  ["q_where_from", "Where does it want to go from?", "The origin — PD array, FVG, OB, sweep."],
  ["q_why", "Why is it going in that direction?", "HTF narrative, bias, displacement."],
  ["q_when", "When does it go in that direction?", "Session / kill zone / news timing."],
] as const;

const tri = (v: boolean | null | undefined) => (v === true ? "yes" : v === false ? "no" : "");

/** Yes / No / not reviewed radio group (posts "", "yes" or "no"). */
function TriField({ name, label, value }: { name: string; label: string; value: boolean | null | undefined }) {
  const initial = tri(value);
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
        {([["", "—"], ["yes", "Yes"], ["no", "No"]] as const).map(([v, l]) => (
          <label key={v} className="cursor-pointer">
            <input type="radio" name={name} value={v} defaultChecked={initial === v} className="peer sr-only" />
            <span className="block rounded-md px-3 py-1 text-xs font-medium text-muted transition-colors peer-checked:bg-surface peer-checked:text-fg peer-checked:shadow-card peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ring)]">{l}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Block({ title, description, icon, children, className }: { title: string; description?: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("card", className)}>
      <header className="flex items-start gap-2.5 px-5 pt-4 pb-3">
        <span className="mt-0.5 text-faint">{icon}</span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
        </div>
      </header>
      <div className="px-5 pb-5">{children}</div>
    </section>
  );
}

function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function PrepDayPage({ params, searchParams }: PageProps<"/prep/[date]">) {
  const { date } = await params;
  if (!isoDate.safeParse(date).success || Number.isNaN(Date.parse(date))) notFound();
  const sp = await searchParams;
  const { supabase, userId } = await requireUser();
  const [profile, ref, prepsRes, trades] = await Promise.all([
    getProfile(supabase, userId),
    getRefData(supabase),
    supabase.from("daily_preps").select("*").eq("prep_date", date).order("created_at"),
    getTrades(supabase, { from: date, to: date, sample: true }),
  ]);
  const preps = (prepsRes.data ?? []) as DailyPrep[];
  const wantNew = sp.id === "new";
  const current = wantNew ? undefined : preps.find((p) => p.id === sp.id) ?? preps[0];
  const relevantTrades = trades.filter((t) => (current?.is_sample ? true : !t.is_sample) && (!current?.instrument_id || t.instrument_id === current.instrument_id));
  const s = summarize(relevantTrades);
  const sym = new Map(ref.instruments.map((i) => [i.id, i.symbol]));
  const tz = profile.trading_timezone;
  const today = todayInZone(tz);
  const dateLabel = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  const p = current;
  const longs = relevantTrades.filter((t) => t.direction === "long").length;
  const shorts = relevantTrades.length - longs;

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-1">Daily preparation{date === today ? " · today" : ""}</div>
          <h1 className="text-[22px] font-semibold tracking-tight">{dateLabel}</h1>
          <p className="mt-1 text-sm text-muted">Trading day in {tz} ({tzAbbreviation(new Date(`${date}T16:00:00Z`), tz)} — daylight saving handled automatically)</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-line bg-surface shadow-card">
            <Link href={`/prep/${addDays(date, -1)}`} className="flex h-8 w-8 items-center justify-center text-muted hover:text-fg" aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></Link>
            {date !== today ? <Link href={`/prep/${today}`} className="flex h-8 items-center border-x border-line px-3 text-xs font-medium hover:bg-surface-2">Today</Link> : null}
            <Link href={`/prep/${addDays(date, 1)}`} className="flex h-8 w-8 items-center justify-center text-muted hover:text-fg" aria-label="Next day"><ChevronRight className="h-4 w-4" /></Link>
          </div>
          <Link href="/prep" className="btn"><List className="h-4 w-4" /> All days</Link>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-1 border-b border-line" role="tablist" aria-label="Preparations for this day">
        {preps.map((x) => (
          <Link key={x.id} href={`/prep/${date}?id=${x.id}`} role="tab" aria-selected={x.id === p?.id}
            className={cx("-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium", x.id === p?.id ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg")}>
            {x.instrument_id ? sym.get(x.instrument_id) : "General"}
            {x.reviewed_at ? <Badge tone="profit">Reviewed</Badge> : null}
            {x.is_sample ? <Badge tone="warn">Sample</Badge> : null}
          </Link>
        ))}
        <Link href={`/prep/${date}?id=new`} className={cx("-mb-px inline-flex items-center gap-1 border-b-2 px-3 py-2.5 text-sm font-medium", !p ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg")}>
          <Plus className="h-3.5 w-3.5" /> {preps.length ? "Another instrument" : "New preparation"}
        </Link>
      </div>

      <ActionForm key={p?.id ?? "new"} action={savePrep}>
        {p ? <input type="hidden" name="id" value={p.id} /> : null}
        <input type="hidden" name="prep_date" value={date} />

        <div className="space-y-4">
          {/* Context strip */}
          <section className="card grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-5">
            <Field label="Instrument">
              <select name="instrument_id" className="field" defaultValue={p?.instrument_id ?? ""}>
                <option value="">General (all)</option>
                {ref.instruments.filter((i) => i.is_active || i.id === p?.instrument_id).map((i) => <option key={i.id} value={i.id}>{i.symbol}</option>)}
              </select>
            </Field>
            <Field label="Daily bias">
              <select name="daily_bias" className="field" defaultValue={p?.daily_bias ?? ""}>
                <option value="">—</option>{BIASES.map((b) => <option key={b} value={b}>{titleCase(b)}</option>)}
              </select>
            </Field>
            <Field label="Expected direction">
              <select name="expected_direction" className="field" defaultValue={p?.expected_direction ?? ""}>
                <option value="">—</option>{EXPECTED_DIRECTIONS.map((b) => <option key={b} value={b}>{titleCase(b)}</option>)}
              </select>
            </Field>
            <Field label="Expected volatility">
              <select name="expected_volatility" className="field" defaultValue={p?.expected_volatility ?? ""}>
                <option value="">—</option>{VOLATILITY.map((b) => <option key={b} value={b}>{titleCase(b)}</option>)}
              </select>
            </Field>
            <Field label="Planned session">
              <select name="planned_session" className="field" defaultValue={p?.planned_session ?? ""}>
                <option value="">—</option>{SESSIONS.map((b) => <option key={b} value={b}>{SESSION_LABELS[b]}</option>)}
              </select>
            </Field>
          </section>

          {/* The four questions */}
          <section className="card overflow-hidden">
            <header className="flex items-center gap-2.5 border-b border-line bg-accent-soft px-5 py-3.5">
              <Compass className="h-4 w-4 text-accent" />
              <div>
                <h2 className="text-sm font-semibold">The four questions</h2>
                <p className="text-xs text-muted">Answer before the session opens.</p>
              </div>
            </header>
            <div className="grid gap-px bg-line md:grid-cols-2">
              {QUESTIONS.map(([k, q, help], i) => (
                <label key={k} className="block bg-surface p-5">
                  <span className="flex items-start gap-3">
                    <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg">{i + 1}</span>
                    <span>
                      <span className="block text-[15px] font-semibold leading-snug">{q}</span>
                      <span className="mt-0.5 block text-xs text-faint">{help}</span>
                    </span>
                  </span>
                  <textarea name={k} className="field mt-3" defaultValue={p?.[k] ?? ""} />
                </label>
              ))}
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-4">
              <Block title="Levels & liquidity" icon={<Crosshair className="h-4 w-4" />} description="Reference prices for the day">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {KEY_LEVELS.map(([k, l]) => (
                    <Field key={k} label={l}><input name={k} className="field num" inputMode="decimal" defaultValue={p?.[k] ?? ""} /></Field>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <Field label="Important liquidity levels"><textarea name="liquidity_levels" className="field" defaultValue={p?.liquidity_levels ?? ""} /></Field>
                  <Field label="Potential liquidity targets"><textarea name="liquidity_targets" className="field" defaultValue={p?.liquidity_targets ?? ""} /></Field>
                </div>
              </Block>

              <Block title="Analysis & plan" icon={<Scale className="h-4 w-4" />}>
                <div className="grid gap-3 lg:grid-cols-2">
                  <Field label="Higher-timeframe analysis"><textarea name="htf_analysis" className="field" defaultValue={p?.htf_analysis ?? ""} /></Field>
                  <Field label="Potential setups"><textarea name="potential_setups" className="field" defaultValue={p?.potential_setups ?? ""} /></Field>
                  <Field label="General market observations"><textarea name="observations" className="field" defaultValue={p?.observations ?? ""} /></Field>
                  <Field label={<span className="inline-flex items-center gap-1"><Newspaper className="h-3 w-3" /> Economic news (NY time)</span>}>
                    <textarea name="economic_news" className="field" defaultValue={p?.economic_news ?? ""} placeholder="e.g. 08:30 CPI" />
                  </Field>
                  <Field label="Daily trading plan" className="lg:col-span-2"><textarea name="trading_plan" className="field min-h-[110px]" defaultValue={p?.trading_plan ?? ""} /></Field>
                </div>
              </Block>
            </div>

            <div className="min-w-0 space-y-4">
              <Block title="End-of-day review" icon={<ClipboardCheck className="h-4 w-4" />} description="Compare the plan with what actually happened">
                <div className="grid grid-cols-2 gap-4">
                  <TriField name="bias_correct" label="Bias correct?" value={p?.bias_correct} />
                  <TriField name="target_reached" label="Target reached?" value={p?.target_reached} />
                  <TriField name="setup_correct" label="Correct setup?" value={p?.setup_correct} />
                  <TriField name="followed_plan" label="Followed plan?" value={p?.followed_plan} />
                </div>
                <div className="mt-4 space-y-3">
                  <Field label="What actually happened?"><textarea name="actual_outcome" className="field" defaultValue={p?.actual_outcome ?? ""} /></Field>
                  <Field label="What could I have done better?"><textarea name="could_improve" className="field" defaultValue={p?.could_improve ?? ""} /></Field>
                  <Field label="What did I learn today?"><textarea name="lessons_today" className="field" defaultValue={p?.lessons_today ?? ""} /></Field>
                </div>
              </Block>

              <section className="card">
                <header className="flex items-center justify-between px-5 pt-4 pb-3">
                  <h2 className="text-sm font-semibold">Plan vs. actual</h2>
                  <Link href="/journal/new" className="btn btn-sm"><Plus className="h-3.5 w-3.5" /> Trade</Link>
                </header>
                <div className="px-5 pb-5">
                  {p ? (
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      <div><dt className="text-xs text-muted">Planned bias</dt><dd className="mt-0.5 font-medium">{titleCase(p.daily_bias)}</dd></div>
                      <div><dt className="text-xs text-muted">Bias correct</dt><dd className="mt-0.5 font-medium">{p.bias_correct == null ? <span className="text-faint">not reviewed</span> : p.bias_correct ? <Badge tone="profit">✓ Yes</Badge> : <Badge tone="loss">✕ No</Badge>}</dd></div>
                      <div><dt className="text-xs text-muted">Planned session</dt><dd className="mt-0.5 font-medium">{p.planned_session ? SESSION_LABELS[p.planned_session] : "—"}</dd></div>
                      <div><dt className="text-xs text-muted">Trades in plan session</dt><dd className="num mt-0.5 font-medium">{p.planned_session ? `${relevantTrades.filter((t) => t.session === p.planned_session).length} / ${relevantTrades.length}` : "—"}</dd></div>
                      <div><dt className="text-xs text-muted">Long / short taken</dt><dd className="num mt-0.5 font-medium">{longs} / {shorts}</dd></div>
                      <div><dt className="text-xs text-muted">Net P/L</dt><dd className={cx("num mt-0.5 font-semibold", s.netPnl > 0 && "text-profit", s.netPnl < 0 && "text-loss")}>{fmtMoney(s.netPnl, "USD", true)}</dd></div>
                    </dl>
                  ) : <p className="text-sm text-faint">Save a preparation to compare it with the day’s trades.</p>}
                  <div className="mt-4 border-t border-line pt-3">
                    <div className="eyebrow mb-2">Trades on this day{p?.instrument_id ? ` · ${sym.get(p.instrument_id)}` : ""}</div>
                    {relevantTrades.length ? (
                      <ul className="divide-y divide-line text-sm">
                        {relevantTrades.map((t) => (
                          <li key={t.id}>
                            <Link href={`/journal/${t.id}`} className="flex items-center justify-between gap-2 py-2 hover:text-accent">
                              <span className="flex items-center gap-2">
                                <span className="num text-xs text-muted">{formatInZone(t.entry_time, tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</span>
                                <span className="font-medium">{sym.get(t.instrument_id)}</span>
                                <DirectionBadge direction={t.direction} />
                              </span>
                              <span className={cx("num", (t.net_pnl ?? 0) > 0 && "text-profit", (t.net_pnl ?? 0) < 0 && "text-loss")}>
                                {fmtMoney(t.net_pnl, "USD", true)} <span className="text-xs text-faint">{fmtR(t.r_multiple)}</span>
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-sm text-faint">No trades recorded.</p>}
                  </div>
                </div>
              </section>
            </div>
          </div>

          <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-bg/90 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
            <span className="mr-auto text-xs text-faint">{p?.updated_at ? `Last saved ${formatInZone(p.updated_at, tz)}` : "Not saved yet"}</span>
            <SubmitButton className="btn-primary">{p ? "Save preparation" : "Create preparation"}</SubmitButton>
          </div>
        </div>
      </ActionForm>

      {p ? (
        <form action={deletePrep} className="mt-4 flex justify-end">
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="prep_date" value={date} />
          <SubmitButton className="btn-ghost btn-sm text-loss" confirm="This permanently deletes this day's preparation and review. This cannot be undone." confirmLabel="Delete preparation">Delete this preparation</SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
