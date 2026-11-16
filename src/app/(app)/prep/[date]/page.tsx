import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, PageHeader, cx } from "@/components/ui";
import { BIASES, EXPECTED_DIRECTIONS, KEY_LEVELS, SESSIONS, SESSION_LABELS, VOLATILITY } from "@/lib/constants";
import { summarize } from "@/lib/calc/stats";
import type { DailyPrep } from "@/lib/db/types";
import { getProfile, getRefData, getTrades } from "@/lib/data/queries";
import { fmtMoney, fmtR, titleCase } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { formatInZone } from "@/lib/time/zone";
import { isoDate } from "@/lib/validation/common";
import { deletePrep, savePrep } from "../actions";

export const metadata = { title: "Daily Preparation" };

const QUESTIONS = [
  ["q_where_to", "1. Where does the market want to go?"],
  ["q_where_from", "2. Where does it want to go from?"],
  ["q_why", "3. Why is it going in that direction?"],
  ["q_when", "4. When does it go in that direction?"],
] as const;

const tri = (v: boolean | null | undefined) => (v === true ? "yes" : v === false ? "no" : "");

function TriField({ name, label, value }: { name: string; label: string; value: boolean | null | undefined }) {
  return (
    <Field label={label}>
      <select name={name} className="field" defaultValue={tri(value)}>
        <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
      </select>
    </Field>
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
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  const p = current;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={`Daily preparation · ${date}`}
        subtitle={`${weekday} · ${tz}`}
        actions={
          <>
            <Link href={`/prep/${addDays(date, -1)}`} className="btn btn-sm">← Prev day</Link>
            <Link href={`/prep/${addDays(date, 1)}`} className="btn btn-sm">Next day →</Link>
            <Link href="/prep" className="btn btn-sm">All days</Link>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-line">
        {preps.map((x) => (
          <Link key={x.id} href={`/prep/${date}?id=${x.id}`}
            className={cx("-mb-px border-b-2 px-3 py-2 text-sm", x.id === p?.id ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg")}>
            {x.instrument_id ? sym.get(x.instrument_id) : "General"} {x.is_sample ? <Badge tone="warn">Sample</Badge> : null}
          </Link>
        ))}
        <Link href={`/prep/${date}?id=new`} className={cx("-mb-px border-b-2 px-3 py-2 text-sm", !p ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg")}>
          + {preps.length ? "Another instrument" : "New preparation"}
        </Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <ActionForm key={p?.id ?? "new"} action={savePrep} className="space-y-4">
          {p ? <input type="hidden" name="id" value={p.id} /> : null}
          <input type="hidden" name="prep_date" value={date} />

          <Card title="Pre-market plan">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
            </div>
          </Card>

          <section className="card border-accent/40">
            <header className="border-b border-line px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wider text-accent">The four questions</header>
            <div className="grid gap-3 p-4 lg:grid-cols-2">
              {QUESTIONS.map(([k, q]) => (
                <Field key={k} label={q}><textarea name={k} className="field" defaultValue={p?.[k] ?? ""} /></Field>
              ))}
            </div>
          </section>

          <Card title="Analysis & levels">
            <div className="grid gap-3 sm:grid-cols-4">
              {KEY_LEVELS.map(([k, l]) => (
                <Field key={k} label={l}><input name={k} className="field num" inputMode="decimal" defaultValue={p?.[k] ?? ""} /></Field>
              ))}
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <Field label="Higher-timeframe analysis"><textarea name="htf_analysis" className="field" defaultValue={p?.htf_analysis ?? ""} /></Field>
              <Field label="Important liquidity levels"><textarea name="liquidity_levels" className="field" defaultValue={p?.liquidity_levels ?? ""} /></Field>
              <Field label="Potential liquidity targets"><textarea name="liquidity_targets" className="field" defaultValue={p?.liquidity_targets ?? ""} /></Field>
              <Field label="Important economic news"><textarea name="economic_news" className="field" defaultValue={p?.economic_news ?? ""} placeholder="e.g. 08:30 CPI (NY time)" /></Field>
              <Field label="Potential setups"><textarea name="potential_setups" className="field" defaultValue={p?.potential_setups ?? ""} /></Field>
              <Field label="General market observations"><textarea name="observations" className="field" defaultValue={p?.observations ?? ""} /></Field>
              <Field label="Daily trading plan" className="lg:col-span-2"><textarea name="trading_plan" className="field min-h-[96px]" defaultValue={p?.trading_plan ?? ""} /></Field>
            </div>
          </Card>

          <Card title="End-of-day review">
            <div className="grid gap-3 sm:grid-cols-4">
              <TriField name="bias_correct" label="Was my daily bias correct?" value={p?.bias_correct} />
              <TriField name="target_reached" label="Liquidity target reached?" value={p?.target_reached} />
              <TriField name="setup_correct" label="Identified the correct setup?" value={p?.setup_correct} />
              <TriField name="followed_plan" label="Followed my plan?" value={p?.followed_plan} />
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <Field label="What actually happened?"><textarea name="actual_outcome" className="field" defaultValue={p?.actual_outcome ?? ""} /></Field>
              <Field label="What could I have done better?"><textarea name="could_improve" className="field" defaultValue={p?.could_improve ?? ""} /></Field>
              <Field label="What did I learn today?"><textarea name="lessons_today" className="field" defaultValue={p?.lessons_today ?? ""} /></Field>
            </div>
          </Card>

          <div className="flex gap-2">
            <SubmitButton className="btn-primary">{p ? "Save preparation" : "Create preparation"}</SubmitButton>
          </div>
        </ActionForm>

        <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
          <Card title="Plan vs. actual">
            {p ? (
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-muted">Bias</dt><dd>{titleCase(p.daily_bias)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Expected</dt><dd>{titleCase(p.expected_direction)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Bias correct</dt><dd>{p.bias_correct == null ? "not reviewed" : p.bias_correct ? "Yes" : "No"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Planned session</dt><dd>{p.planned_session ? SESSION_LABELS[p.planned_session] : "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Trades taken</dt><dd className="num">{relevantTrades.length}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Long / short</dt><dd className="num">{relevantTrades.filter((t) => t.direction === "long").length} / {relevantTrades.filter((t) => t.direction === "short").length}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">In planned session</dt><dd className="num">{p.planned_session ? relevantTrades.filter((t) => t.session === p.planned_session).length : "—"}</dd></div>
                <div className="flex justify-between font-semibold"><dt>Net P/L</dt><dd className={cx("num", s.netPnl > 0 && "text-profit", s.netPnl < 0 && "text-loss")}>{fmtMoney(s.netPnl)}</dd></div>
              </dl>
            ) : (
              <p className="text-sm text-faint">Save a preparation to compare it with the day’s trades.</p>
            )}
          </Card>
          <Card title={`Trades on ${date}`} actions={<Link href="/journal/new" className="btn btn-sm">+ Trade</Link>}>
            {relevantTrades.length ? (
              <ul className="-my-1 divide-y divide-line/60 text-sm">
                {relevantTrades.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-1.5">
                    <Link href={`/journal/${t.id}`} className="hover:text-accent">
                      <span className="num text-muted">{formatInZone(t.entry_time, tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}</span>{" "}
                      {sym.get(t.instrument_id)} <span className={t.direction === "long" ? "text-profit" : "text-loss"}>{t.direction}</span>
                    </Link>
                    <span className={cx("num", (t.net_pnl ?? 0) > 0 && "text-profit", (t.net_pnl ?? 0) < 0 && "text-loss")}>
                      {fmtMoney(t.net_pnl, "USD", true)} <span className="text-faint">{fmtR(t.r_multiple)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-faint">No trades recorded for this date{p?.instrument_id ? " and instrument" : ""}.</p>
            )}
          </Card>
          {p ? (
            <form action={deletePrep}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="prep_date" value={date} />
              <SubmitButton className="btn-danger btn-sm" confirm="Delete this preparation permanently?">Delete this preparation</SubmitButton>
            </form>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
