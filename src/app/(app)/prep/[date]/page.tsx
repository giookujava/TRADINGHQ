import { ChevronLeft, ChevronRight, ClipboardCheck, Compass, Crosshair, List, Newspaper, Plus, Scale } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, DirectionBadge, Field, cx } from "@/components/ui";
import { BIASES, EXPECTED_DIRECTIONS, KEY_LEVELS, SESSIONS, VOLATILITY } from "@/lib/constants";
import { summarize } from "@/lib/calc/stats";
import type { DailyPrep } from "@/lib/db/types";
import { getProfile, getRefData, getTrades } from "@/lib/data/queries";
import { fmtMoney, fmtR } from "@/lib/format";
import { fmt, type Dict } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/supabase/server";
import { formatInZone, todayInZone, tzAbbreviation } from "@/lib/time/zone";
import { isoDate } from "@/lib/validation/common";
import { deletePrep, savePrep } from "../actions";

export const metadata = { title: "Daily Preparation" };

const questions = (P: Dict["prep"]) => [
  ["q_where_to", P.q1, P.q1h],
  ["q_where_from", P.q2, P.q2h],
  ["q_why", P.q3, P.q3h],
  ["q_when", P.q4, P.q4h],
] as const;

const tri = (v: boolean | null | undefined) => (v === true ? "yes" : v === false ? "no" : "");

/** Yes / No / not reviewed radio group (posts "", "yes" or "no"). */
function TriField({ name, label, value, L }: { name: string; label: string; value: boolean | null | undefined; L: Dict }) {
  const initial = tri(value);
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
        {([["", "—"], ["yes", L.common.yes], ["no", L.common.no]] as const).map(([v, l]) => (
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
  const [L, profile, ref, prepsRes, trades] = await Promise.all([
    getT(),
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
  const P = L.prep;
  const dateLabel = new Intl.DateTimeFormat(L.meta.intl, { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  const p = current;
  const longs = relevantTrades.filter((t) => t.direction === "long").length;
  const shorts = relevantTrades.length - longs;

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">{P.dayEyebrow}{date === today ? P.todaySuffix : ""}</div>
          <h1 className="text-[28px] font-extrabold tracking-tight md:text-[36px]">{dateLabel}</h1>
          <p className="mt-2 text-[15px] text-muted">{fmt(P.tradingDay, { z: tz, a: tzAbbreviation(new Date(`${date}T16:00:00Z`), tz) })}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-line bg-surface shadow-card">
            <Link href={`/prep/${addDays(date, -1)}`} className="flex h-8 w-8 items-center justify-center text-muted hover:text-fg" aria-label={P.prevDay}><ChevronLeft className="h-4 w-4" /></Link>
            {date !== today ? <Link href={`/prep/${today}`} className="flex h-8 items-center border-x border-line px-3 text-xs font-medium hover:bg-surface-2">{L.common.today}</Link> : null}
            <Link href={`/prep/${addDays(date, 1)}`} className="flex h-8 w-8 items-center justify-center text-muted hover:text-fg" aria-label={P.nextDay}><ChevronRight className="h-4 w-4" /></Link>
          </div>
          <Link href="/prep" className="btn"><List className="h-4 w-4" /> {P.allDays}</Link>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-1 border-b border-line" role="tablist" aria-label="Preparations for this day">
        {preps.map((x) => (
          <Link key={x.id} href={`/prep/${date}?id=${x.id}`} role="tab" aria-selected={x.id === p?.id}
            className={cx("-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium", x.id === p?.id ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg")}>
            {x.instrument_id ? sym.get(x.instrument_id) : L.common.general}
            {x.reviewed_at ? <Badge tone="profit">{L.common.reviewed}</Badge> : null}
            {x.is_sample ? <Badge tone="warn">{L.common.sample}</Badge> : null}
          </Link>
        ))}
        <Link href={`/prep/${date}?id=new`} className={cx("-mb-px inline-flex items-center gap-1 border-b-2 px-3 py-2.5 text-sm font-medium", !p ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg")}>
          <Plus className="h-3.5 w-3.5" /> {preps.length ? P.another : P.newPrep}
        </Link>
      </div>

      <ActionForm key={p?.id ?? "new"} action={savePrep}>
        {p ? <input type="hidden" name="id" value={p.id} /> : null}
        <input type="hidden" name="prep_date" value={date} />

        <div className="space-y-4">
          {/* Context strip */}
          <section className="card grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-5">
            <Field label={P.instrument}>
              <select name="instrument_id" className="field" defaultValue={p?.instrument_id ?? ""}>
                <option value="">{P.generalAll}</option>
                {ref.instruments.filter((i) => i.is_active || i.id === p?.instrument_id).map((i) => <option key={i.id} value={i.id}>{i.symbol}</option>)}
              </select>
            </Field>
            <Field label={P.dailyBias}>
              <select name="daily_bias" className="field" defaultValue={p?.daily_bias ?? ""}>
                <option value="">—</option>{BIASES.map((b) => <option key={b} value={b}>{L.labels.bias[b]}</option>)}
              </select>
            </Field>
            <Field label={P.expectedDirection}>
              <select name="expected_direction" className="field" defaultValue={p?.expected_direction ?? ""}>
                <option value="">—</option>{EXPECTED_DIRECTIONS.map((b) => <option key={b} value={b}>{L.labels.direction[b]}</option>)}
              </select>
            </Field>
            <Field label={P.expectedVolatility}>
              <select name="expected_volatility" className="field" defaultValue={p?.expected_volatility ?? ""}>
                <option value="">—</option>{VOLATILITY.map((b) => <option key={b} value={b}>{L.labels.volatility[b]}</option>)}
              </select>
            </Field>
            <Field label={P.plannedSession}>
              <select name="planned_session" className="field" defaultValue={p?.planned_session ?? ""}>
                <option value="">—</option>{SESSIONS.map((b) => <option key={b} value={b}>{L.labels.sessions[b]}</option>)}
              </select>
            </Field>
          </section>

          {/* The four questions */}
          <section className="card overflow-hidden">
            <header className="flex items-center gap-2.5 border-b border-line bg-accent-soft px-5 py-3.5">
              <Compass className="h-4 w-4 text-accent" />
              <div>
                <h2 className="text-base font-bold">{P.fourQuestions}</h2>
                <p className="text-xs text-muted">{P.fourHint}</p>
              </div>
            </header>
            <div className="grid gap-px bg-line md:grid-cols-2">
              {questions(P).map(([k, q, help], i) => (
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
              <Block title={P.levels} icon={<Crosshair className="h-4 w-4" />} description={P.levelsHint}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {KEY_LEVELS.map(([k]) => (
                    <Field key={k} label={L.labels.levels[k]}><input name={k} className="field num" inputMode="decimal" defaultValue={p?.[k] ?? ""} /></Field>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <Field label={P.liquidityLevels}><textarea name="liquidity_levels" className="field" defaultValue={p?.liquidity_levels ?? ""} /></Field>
                  <Field label={P.liquidityTargets}><textarea name="liquidity_targets" className="field" defaultValue={p?.liquidity_targets ?? ""} /></Field>
                </div>
              </Block>

              <Block title={P.analysisPlan} icon={<Scale className="h-4 w-4" />}>
                <div className="grid gap-3 lg:grid-cols-2">
                  <Field label={P.htf}><textarea name="htf_analysis" className="field" defaultValue={p?.htf_analysis ?? ""} /></Field>
                  <Field label={P.setups}><textarea name="potential_setups" className="field" defaultValue={p?.potential_setups ?? ""} /></Field>
                  <Field label={P.observations}><textarea name="observations" className="field" defaultValue={p?.observations ?? ""} /></Field>
                  <Field label={<span className="inline-flex items-center gap-1"><Newspaper className="h-3 w-3" /> {P.news}</span>}>
                    <textarea name="economic_news" className="field" defaultValue={p?.economic_news ?? ""} placeholder={P.newsPh} />
                  </Field>
                  <Field label={P.plan} className="lg:col-span-2"><textarea name="trading_plan" className="field min-h-[110px]" defaultValue={p?.trading_plan ?? ""} /></Field>
                </div>
              </Block>
            </div>

            <div className="min-w-0 space-y-4">
              <Block title={P.review} icon={<ClipboardCheck className="h-4 w-4" />} description={P.reviewHint}>
                <div className="grid grid-cols-2 gap-4">
                  <TriField L={L} name="bias_correct" label={P.biasCorrect} value={p?.bias_correct} />
                  <TriField L={L} name="target_reached" label={P.targetReached} value={p?.target_reached} />
                  <TriField L={L} name="setup_correct" label={P.setupCorrect} value={p?.setup_correct} />
                  <TriField L={L} name="followed_plan" label={P.followed} value={p?.followed_plan} />
                </div>
                <div className="mt-4 space-y-3">
                  <Field label={P.happened}><textarea name="actual_outcome" className="field" defaultValue={p?.actual_outcome ?? ""} /></Field>
                  <Field label={P.better}><textarea name="could_improve" className="field" defaultValue={p?.could_improve ?? ""} /></Field>
                  <Field label={P.learned}><textarea name="lessons_today" className="field" defaultValue={p?.lessons_today ?? ""} /></Field>
                </div>
              </Block>

              <section className="card">
                <header className="flex items-center justify-between px-5 pt-4 pb-3">
                  <h2 className="text-base font-bold">{P.planVsActual}</h2>
                  <Link href="/journal/new" className="btn btn-sm"><Plus className="h-3.5 w-3.5" /> {P.tradeBtn}</Link>
                </header>
                <div className="px-5 pb-5">
                  {p ? (
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      <div><dt className="text-xs text-muted">{P.plannedBias}</dt><dd className="mt-0.5 font-medium">{p.daily_bias ? L.labels.bias[p.daily_bias] : "—"}</dd></div>
                      <div><dt className="text-xs text-muted">{P.colBiasCorrect}</dt><dd className="mt-0.5 font-medium">{p.bias_correct == null ? <span className="text-faint">{P.notReviewed}</span> : p.bias_correct ? <Badge tone="profit">✓ {L.common.yes}</Badge> : <Badge tone="loss">✕ {L.common.no}</Badge>}</dd></div>
                      <div><dt className="text-xs text-muted">{P.plannedSessionShort}</dt><dd className="mt-0.5 font-medium">{p.planned_session ? L.labels.sessions[p.planned_session] : "—"}</dd></div>
                      <div><dt className="text-xs text-muted">{P.inPlanSession}</dt><dd className="num mt-0.5 font-medium">{p.planned_session ? `${relevantTrades.filter((t) => t.session === p.planned_session).length} / ${relevantTrades.length}` : "—"}</dd></div>
                      <div><dt className="text-xs text-muted">{P.longShort}</dt><dd className="num mt-0.5 font-medium">{longs} / {shorts}</dd></div>
                      <div><dt className="text-xs text-muted">{P.net}</dt><dd className={cx("num mt-0.5 font-semibold", s.netPnl > 0 && "text-profit", s.netPnl < 0 && "text-loss")}>{fmtMoney(s.netPnl, "USD", true)}</dd></div>
                    </dl>
                  ) : <p className="text-sm text-faint">{P.saveFirst}</p>}
                  <div className="mt-4 border-t border-line pt-3">
                    <div className="eyebrow mb-2">{P.tradesOnDay}{p?.instrument_id ? ` · ${sym.get(p.instrument_id)}` : ""}</div>
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
                    ) : <p className="text-sm text-faint">{P.noTrades}</p>}
                  </div>
                </div>
              </section>
            </div>
          </div>

          <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-line bg-surface/90 px-4 py-3 shadow-pop backdrop-blur">
            <span className="mr-auto text-xs text-faint">{p?.updated_at ? fmt(P.lastSaved, { t: formatInZone(p.updated_at, tz) }) : P.notSaved}</span>
            <SubmitButton className="btn-primary">{p ? P.savePrep : P.createPrep}</SubmitButton>
          </div>
        </div>
      </ActionForm>

      {p ? (
        <form action={deletePrep} className="mt-4 flex justify-end">
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="prep_date" value={date} />
          <SubmitButton className="btn-ghost btn-sm text-loss" confirm={P.deleteConfirm} confirmLabel={P.deleteBtn}>{P.deletePrep}</SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
