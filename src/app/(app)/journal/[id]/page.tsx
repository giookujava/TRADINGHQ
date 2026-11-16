import { ArrowLeft, Brain, CalendarCheck, Camera, ChartCandlestick, ListChecks, NotebookPen, Pencil, Tag } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/action-form";
import { Badge, DirectionBadge, cx } from "@/components/ui";
import { ICT_FLAGS, KEY_LEVELS, PSYCH_FLAGS, SCREENSHOT_BUCKET, SCREENSHOT_PHASES, SESSION_LABELS, TRADE_TYPE_LABELS } from "@/lib/constants";
import { formatDuration } from "@/lib/calc/trade";
import { supabaseEnv } from "@/lib/env";
import { fmtMoney, fmtNum, fmtPrice, fmtR, titleCase } from "@/lib/format";
import { getProfile, getRefData } from "@/lib/data/queries";
import { getTradeDetail } from "@/lib/data/trade-detail";
import { requireUser } from "@/lib/supabase/server";
import { formatInZone } from "@/lib/time/zone";
import { uuid } from "@/lib/validation/common";
import { deleteTrade } from "../actions";
import { ScreenshotCard, ScreenshotUploader } from "./screenshots";

export const metadata = { title: "Trade" };

function YesNo({ v, invert }: { v: boolean | null; invert?: boolean }) {
  if (v === null || v === undefined) return null;
  const good = invert ? !v : v;
  return <Badge tone={good ? "profit" : "loss"}>{v ? "✓ Yes" : "✕ No"}</Badge>;
}

function Panel({ title, icon, children, className, actions }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <section className={cx("card", className)}>
      <header className="flex items-center justify-between gap-2 px-5 pt-4 pb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><span className="text-faint">{icon}</span>{title}</h2>
        {actions}
      </header>
      <div className="px-5 pb-5">{children}</div>
    </section>
  );
}

function KV({ items, emptyText = "Nothing recorded." }: { items: [string, React.ReactNode][]; emptyText?: string | null }) {
  const shown = items.filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (!shown.length) return emptyText ? <p className="text-sm text-faint">{emptyText}</p> : null;
  return (
    <dl className="divide-y divide-line">
      {shown.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-4 py-2 text-sm">
          <dt className="text-muted">{k}</dt><dd className="text-right">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Prose({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <div>
      <div className="eyebrow mb-1.5">{label}</div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
    </div>
  );
}

function Fact({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted">{label}</div>
      <div className="num mt-1 truncate text-[15px] font-semibold">{value}</div>
      {hint ? <div className="mt-0.5 truncate text-[11px] text-faint">{hint}</div> : null}
    </div>
  );
}

export default async function TradePage({ params }: PageProps<"/journal/[id]">) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const { supabase, userId } = await requireUser();
  const [profile, ref, detail] = await Promise.all([getProfile(supabase, userId), getRefData(supabase), getTradeDetail(supabase, id)]);
  if (!detail) notFound();
  const { trade: t, executions, screenshots, tagIds } = detail;
  const tz = profile.trading_timezone;
  const tz2 = profile.display_timezone && profile.display_timezone !== tz ? profile.display_timezone : null;
  const instrument = ref.instruments.find((i) => i.id === t.instrument_id);
  const account = ref.accounts.find((a) => a.id === t.account_id);
  const strategy = ref.strategies.find((s) => s.id === t.strategy_id);
  const tags = ref.tags.filter((g) => tagIds.includes(g.id));
  const env = supabaseEnv()!;
  const net = Number(t.net_pnl ?? 0);

  const signed = screenshots.length
    ? (await supabase.storage.from(SCREENSHOT_BUCKET).createSignedUrls(screenshots.map((s) => s.storage_path), 3600)).data ?? []
    : [];
  const urlFor = (path: string) => signed.find((s) => s.path === path)?.signedUrl ?? null;
  const fmt = (iso: string, zone: string) => formatInZone(iso, zone, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const entrySide = t.direction === "long" ? "buy" : "sell";

  const customValues = ref.customFields
    .filter((c) => t.custom_fields?.[c.id] !== undefined)
    .map((c) => [c.name, typeof t.custom_fields[c.id] === "boolean" ? (t.custom_fields[c.id] ? "Yes" : "No") : String(t.custom_fields[c.id])] as [string, string]);
  const NEGATIVE = new Set(["entered_early", "exited_early", "moved_stop", "revenge_trade", "overtraded"]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <Link href="/journal" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" /> Trade journal</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] font-semibold tracking-tight">{instrument?.symbol ?? "?"}</h1>
            <DirectionBadge direction={t.direction} />
            {t.status === "open" ? <Badge tone="warn">Open position</Badge> : <Badge>Closed</Badge>}
            {t.is_sample ? <Badge tone="warn">Sample data</Badge> : null}
            {t.source !== "manual" ? <Badge tone="accent">Imported · {t.source}</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted">
            {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${t.trade_date}T12:00:00Z`))}
            {t.session ? ` · ${SESSION_LABELS[t.session]}` : ""} · {TRADE_TYPE_LABELS[t.trade_type]} · {account?.name}
            {strategy ? <> · <span className="text-fg">{strategy.name}</span></> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/prep/${t.trade_date}`} className="btn"><CalendarCheck className="h-4 w-4" /> Daily prep</Link>
          <Link href={`/journal/${t.id}/edit`} className="btn btn-primary"><Pencil className="h-4 w-4" /> Edit</Link>
          <form action={deleteTrade}>
            <input type="hidden" name="id" value={t.id} />
            <SubmitButton className="btn-danger" confirm="This permanently deletes the trade, its executions and its screenshots. This cannot be undone." confirmLabel="Delete trade">Delete</SubmitButton>
          </form>
        </div>
      </div>

      {/* Result summary */}
      <section className="card grid overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)]">
        <div className={cx("border-b border-line p-6 lg:border-r lg:border-b-0", net > 0 && "bg-profit-soft/40", net < 0 && "bg-loss-soft/40")}>
          <div className="text-xs font-medium text-muted">Net P/L{t.status === "open" ? " (realized so far)" : ""}</div>
          <div className={cx("num mt-2 text-[36px] font-semibold leading-none tracking-tight", net > 0 && "text-profit", net < 0 && "text-loss")}>{fmtMoney(t.net_pnl, "USD", true)}</div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span>R <span className={cx("num font-semibold", (t.r_multiple ?? 0) > 0 && "text-profit", (t.r_multiple ?? 0) < 0 && "text-loss")}>{fmtR(t.r_multiple)}</span></span>
            <span>Gross <span className="num text-fg">{fmtMoney(t.gross_pnl)}</span></span>
            <span>Fees <span className="num text-fg">{fmtMoney(t.total_fees)}</span></span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 p-6 sm:grid-cols-4">
          <Fact label="Avg entry" value={fmtPrice(t.avg_entry_price)} hint={`${t.total_entry_qty ?? "—"} contracts in`} />
          <Fact label="Avg exit" value={fmtPrice(t.avg_exit_price)} hint={`${t.total_exit_qty ?? 0} contracts out`} />
          <Fact label="Max position" value={t.max_position ?? "—"} hint={`${fmtNum(t.points, 4)} pts / contract`} />
          <Fact label="Duration" value={formatDuration(t.holding_seconds)} />
          <Fact label="Stop-loss" value={fmtPrice(t.stop_loss)} />
          <Fact label="Take-profit" value={fmtPrice(t.take_profit)} />
          <Fact label="Planned risk" value={fmtMoney(t.planned_risk)} hint={t.planned_risk_override ? "manual override" : t.planned_risk ? "from stop × size" : "no stop / risk set"} />
          <Fact label="Contract" value={instrument ? `$${fmtNum(Number(instrument.point_value))}/pt` : "—"} hint={t.adjustment_fees ? `incl. ${fmtMoney(t.adjustment_fees)} other fees` : undefined} />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Panel title={`Executions · ${executions.length}`} icon={<ListChecks className="h-4 w-4" />}>
            <div className="-mx-5 overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Time ({tz.split("/").pop()?.replace("_", " ")})</th>{tz2 ? <th>{tz2.split("/").pop()?.replace("_", " ")}</th> : null}
                    <th>Type</th><th className="text-right">Contracts</th><th className="text-right">Price</th><th className="text-right">Fees</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.map((e) => (
                    <tr key={e.id}>
                      <td className="num">{fmt(e.executed_at, tz)}</td>
                      {tz2 ? <td className="num text-muted">{fmt(e.executed_at, tz2)}</td> : null}
                      <td>
                        <span className="text-sm">{e.side === entrySide ? "Entry" : "Exit"}</span>{" "}
                        <span className={cx("num text-[11px] font-semibold uppercase", e.side === "buy" ? "text-profit" : "text-loss")}>{e.side}</span>
                      </td>
                      <td className="num text-right">{e.quantity}</td>
                      <td className="num text-right">{fmtPrice(e.price)}</td>
                      <td className="num text-right text-muted">{fmtMoney(e.fees)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title={`Screenshots · ${screenshots.length}`} icon={<Camera className="h-4 w-4" />}>
            <ScreenshotUploader tradeId={t.id} userId={userId} supabaseUrl={env.url} supabaseKey={env.key} />
            {screenshots.length ? (
              <div className="mt-5 space-y-5">
                {SCREENSHOT_PHASES.map((ph) => {
                  const list = screenshots.filter((s) => s.phase === ph);
                  if (!list.length) return null;
                  return (
                    <div key={ph}>
                      <div className="eyebrow mb-2">{ph === "other" ? "Other" : `${titleCase(ph)} the trade`}</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {list.map((s) => <ScreenshotCard key={s.id} shot={s} url={urlFor(s.storage_path)} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </Panel>

          <Panel title="Notes & lessons" icon={<NotebookPen className="h-4 w-4" />}>
            {t.notes || t.mistakes || t.lessons || t.analysis_notes ? (
              <div className="space-y-4">
                <Prose label="Analysis notes" text={t.analysis_notes} />
                <Prose label="Mistakes" text={t.mistakes} />
                <Prose label="Lessons learned" text={t.lessons} />
                <Prose label="Notes" text={t.notes} />
              </div>
            ) : <p className="text-sm text-faint">No written notes for this trade.</p>}
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel title="Market analysis" icon={<ChartCandlestick className="h-4 w-4" />}>
            <KV items={[
              ["Daily bias", t.daily_bias ? titleCase(t.daily_bias) : null],
              ["HTF bias", t.htf_bias ? titleCase(t.htf_bias) : null],
              ["Market structure", t.market_structure],
              ["Premium / discount", t.premium_discount ? titleCase(t.premium_discount) : null],
              ["Kill zone", t.kill_zone],
              ["Entry confirmation", t.entry_confirmation],
              ["Buy-side liquidity", t.buy_side_liquidity],
              ["Sell-side liquidity", t.sell_side_liquidity],
            ]} emptyText={ICT_FLAGS.some(([k]) => t[k] !== null) || KEY_LEVELS.some(([k]) => t[k] != null) ? null : "Nothing recorded."} />
            {ICT_FLAGS.some(([k]) => t[k] !== null) ? (
              <div className="mt-4 first:mt-0">
                <div className="eyebrow mb-2">Concepts present</div>
                <div className="flex flex-wrap gap-1.5">
                  {ICT_FLAGS.filter(([k]) => t[k] !== null).map(([k, l]) => (
                    <Badge key={k} tone={t[k] ? "accent" : "default"}>{t[k] ? "✓" : "✕"} {l}</Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {KEY_LEVELS.some(([k]) => t[k] != null) ? (
              <div className="mt-4 first:mt-0">
                <div className="eyebrow mb-2">Key levels</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {KEY_LEVELS.filter(([k]) => t[k] != null).map(([k, l]) => (
                    <div key={k} className="flex justify-between"><span className="text-muted">{l}</span><span className="num">{fmtPrice(t[k])}</span></div>
                  ))}
                </div>
              </div>
            ) : null}
          </Panel>

          <Panel title="Psychology & execution" icon={<Brain className="h-4 w-4" />}>
            <KV items={[
              ["Emotion before", t.emotion_before],
              ["Emotion during", t.emotion_during],
              ["Emotion after", t.emotion_after],
              ["Confidence", t.confidence ? <span className="num">{t.confidence}/10</span> : null],
              ...PSYCH_FLAGS.filter(([k]) => t[k] !== null).map(([k, l]) => [l, <YesNo key={k} v={t[k]} invert={NEGATIVE.has(k)} />] as [string, React.ReactNode]),
            ]} />
          </Panel>

          {(tags.length || customValues.length) ? (
            <Panel title="Tags & custom fields" icon={<Tag className="h-4 w-4" />}>
              {tags.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((g) => (
                    <span key={g.id} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-0.5 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ background: g.color }} />{g.name}
                    </span>
                  ))}
                </div>
              ) : null}
              {customValues.length ? <div className={tags.length ? "mt-3" : ""}><KV items={customValues} /></div> : null}
            </Panel>
          ) : null}

          <p className="px-1 text-xs text-faint">
            Created {formatInZone(t.created_at, tz)} · updated {formatInZone(t.updated_at, tz)} ({tz})
          </p>
        </div>
      </div>
    </div>
  );
}
