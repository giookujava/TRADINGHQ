import { ArrowLeft, Brain, CalendarCheck, Camera, ChartCandlestick, ListChecks, NotebookPen, Pencil, Tag } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/action-form";
import { Badge, DirectionBadge, cx } from "@/components/ui";
import { ICT_FLAGS, KEY_LEVELS, PSYCH_FLAGS, SCREENSHOT_BUCKET, SCREENSHOT_PHASES } from "@/lib/constants";
import { formatDuration } from "@/lib/calc/trade";
import { supabaseEnv } from "@/lib/env";
import { fmtMoney, fmtNum, fmtPrice, fmtR } from "@/lib/format";
import { getProfile, getRefData } from "@/lib/data/queries";
import { getTradeDetail } from "@/lib/data/trade-detail";
import { fmt as tf, type Dict } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/supabase/server";
import { formatInZone } from "@/lib/time/zone";
import { uuid } from "@/lib/validation/common";
import { deleteTrade } from "../actions";
import { ScreenshotCard, ScreenshotUploader } from "./screenshots";

export const metadata = { title: "Trade" };

function YesNo({ v, invert, L }: { v: boolean | null; invert?: boolean; L: Dict }) {
  if (v === null || v === undefined) return null;
  const good = invert ? !v : v;
  return <Badge tone={good ? "profit" : "loss"}>{v ? `✓ ${L.common.yes}` : `✕ ${L.common.no}`}</Badge>;
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
  const [L, profile, ref, detail] = await Promise.all([getT(), getProfile(supabase, userId), getRefData(supabase), getTradeDetail(supabase, id)]);
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
    .map((c) => [c.name, typeof t.custom_fields[c.id] === "boolean" ? (t.custom_fields[c.id] ? L.common.yes : L.common.no) : String(t.custom_fields[c.id])] as [string, string]);
  const J = L.journal;
  const NEGATIVE = new Set(["entered_early", "exited_early", "moved_stop", "revenge_trade", "overtraded"]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <Link href="/journal" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" /> {J.back}</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[30px] font-extrabold tracking-tight">{instrument?.symbol ?? "?"}</h1>
            <DirectionBadge direction={t.direction} />
            {t.status === "open" ? <Badge tone="warn">{J.openPosition}</Badge> : <Badge>{L.common.closed}</Badge>}
            {t.is_sample ? <Badge tone="warn">{L.common.sampleData}</Badge> : null}
            {t.source !== "manual" ? <Badge tone="accent">{tf(J.imported, { s: t.source })}</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted">
            {new Intl.DateTimeFormat(L.meta.intl, { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${t.trade_date}T12:00:00Z`))}
            {t.session ? ` · ${L.labels.sessions[t.session]}` : ""} · {L.labels.tradeTypes[t.trade_type]} · {account?.name}
            {strategy ? <> · <span className="text-fg">{strategy.name}</span></> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/prep/${t.trade_date}`} className="btn"><CalendarCheck className="h-4 w-4" /> {J.dailyPrep}</Link>
          <Link href={`/journal/${t.id}/edit`} className="btn btn-primary"><Pencil className="h-4 w-4" /> {L.common.edit}</Link>
          <form action={deleteTrade}>
            <input type="hidden" name="id" value={t.id} />
            <SubmitButton className="btn-danger" confirm={J.deleteConfirm} confirmLabel={J.deleteTrade}>{L.common.delete}</SubmitButton>
          </form>
        </div>
      </div>

      {/* Result summary */}
      <section className="card grid overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)]">
        <div className={cx("border-b border-line p-6 lg:border-r lg:border-b-0", net > 0 && "bg-profit-soft/40", net < 0 && "bg-loss-soft/40")}>
          <div className="text-xs font-medium text-muted">{L.dashboard.netPnl}{t.status === "open" ? J.realizedSoFar : ""}</div>
          <div className={cx("num mt-2 text-[36px] font-semibold leading-none tracking-tight", net > 0 && "text-profit", net < 0 && "text-loss")}>{fmtMoney(t.net_pnl, "USD", true)}</div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span>R <span className={cx("num font-semibold", (t.r_multiple ?? 0) > 0 && "text-profit", (t.r_multiple ?? 0) < 0 && "text-loss")}>{fmtR(t.r_multiple)}</span></span>
            <span>{J.gross} <span className="num text-fg">{fmtMoney(t.gross_pnl)}</span></span>
            <span>{L.dashboard.fees} <span className="num text-fg">{fmtMoney(t.total_fees)}</span></span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 p-6 sm:grid-cols-4">
          <Fact label={J.avgEntry} value={fmtPrice(t.avg_entry_price)} hint={tf(J.contractsIn, { n: t.total_entry_qty ?? "—" })} />
          <Fact label={J.avgExit} value={fmtPrice(t.avg_exit_price)} hint={tf(J.contractsOut, { n: t.total_exit_qty ?? 0 })} />
          <Fact label={J.maxPosition} value={t.max_position ?? "—"} hint={tf(J.ptsPerContract, { n: fmtNum(t.points, 4) })} />
          <Fact label={J.duration} value={formatDuration(t.holding_seconds)} />
          <Fact label={J.stopLoss} value={fmtPrice(t.stop_loss)} />
          <Fact label={J.takeProfit} value={fmtPrice(t.take_profit)} />
          <Fact label={J.plannedRisk} value={fmtMoney(t.planned_risk)} hint={t.planned_risk_override ? J.manualOverride : t.planned_risk ? J.fromStop : J.noRisk} />
          <Fact label={J.contract} value={instrument ? `${fmtNum(Number(instrument.point_value))}/pt` : "—"} hint={t.adjustment_fees ? tf(J.inclOther, { v: fmtMoney(t.adjustment_fees) }) : undefined} />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Panel title={tf(J.executions, { n: executions.length })} icon={<ListChecks className="h-4 w-4" />}>
            <div className="-mx-5 overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>{tf(J.time, { z: tz.split("/").pop()?.replace("_", " ") ?? tz })}</th>{tz2 ? <th>{tz2.split("/").pop()?.replace("_", " ")}</th> : null}
                    <th>{J.type}</th><th className="text-right">{J.contracts}</th><th className="text-right">{J.price}</th><th className="text-right">{J.feesCol}</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.map((e) => (
                    <tr key={e.id}>
                      <td className="num">{fmt(e.executed_at, tz)}</td>
                      {tz2 ? <td className="num text-muted">{fmt(e.executed_at, tz2)}</td> : null}
                      <td>
                        <span className="text-sm">{e.side === entrySide ? J.entryWord : J.exitWord}</span>{" "}
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

          <Panel title={tf(J.screenshots, { n: screenshots.length })} icon={<Camera className="h-4 w-4" />}>
            <ScreenshotUploader tradeId={t.id} userId={userId} supabaseUrl={env.url} supabaseKey={env.key} />
            {screenshots.length ? (
              <div className="mt-5 space-y-5">
                {SCREENSHOT_PHASES.map((ph) => {
                  const list = screenshots.filter((s) => s.phase === ph);
                  if (!list.length) return null;
                  return (
                    <div key={ph}>
                      <div className="eyebrow mb-2">{L.labels.phases[ph]}</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {list.map((s) => <ScreenshotCard key={s.id} shot={s} url={urlFor(s.storage_path)} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </Panel>

          <Panel title={J.notes} icon={<NotebookPen className="h-4 w-4" />}>
            {t.notes || t.mistakes || t.lessons || t.analysis_notes ? (
              <div className="space-y-4">
                <Prose label={J.analysisNotes} text={t.analysis_notes} />
                <Prose label={J.mistakes} text={t.mistakes} />
                <Prose label={J.lessons} text={t.lessons} />
                <Prose label={J.notesLabel} text={t.notes} />
              </div>
            ) : <p className="text-sm text-faint">{J.noNotes}</p>}
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel title={J.marketAnalysis} icon={<ChartCandlestick className="h-4 w-4" />}>
            <KV items={[
              [L.form.dailyBias, t.daily_bias ? L.labels.bias[t.daily_bias] : null],
              [L.form.htfBias, t.htf_bias ? L.labels.bias[t.htf_bias] : null],
              [L.form.marketStructure, t.market_structure],
              [L.form.premiumDiscount, t.premium_discount ? L.labels.premium[t.premium_discount] : null],
              [L.form.killZone, t.kill_zone],
              [L.form.entryConfirmation, t.entry_confirmation],
              [L.form.bsl, t.buy_side_liquidity],
              [L.form.ssl, t.sell_side_liquidity],
            ]} emptyText={ICT_FLAGS.some(([k]) => t[k] !== null) || KEY_LEVELS.some(([k]) => t[k] != null) ? null : L.common.nothingRecorded} />
            {ICT_FLAGS.some(([k]) => t[k] !== null) ? (
              <div className="mt-4 first:mt-0">
                <div className="eyebrow mb-2">{J.conceptsPresent}</div>
                <div className="flex flex-wrap gap-1.5">
                  {ICT_FLAGS.filter(([k]) => t[k] !== null).map(([k]) => (
                    <Badge key={k} tone={t[k] ? "accent" : "default"}>{t[k] ? "✓" : "✕"} {L.labels.ict[k]}</Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {KEY_LEVELS.some(([k]) => t[k] != null) ? (
              <div className="mt-4 first:mt-0">
                <div className="eyebrow mb-2">{J.keyLevels}</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {KEY_LEVELS.filter(([k]) => t[k] != null).map(([k]) => (
                    <div key={k} className="flex justify-between"><span className="text-muted">{L.labels.levels[k]}</span><span className="num">{fmtPrice(t[k])}</span></div>
                  ))}
                </div>
              </div>
            ) : null}
          </Panel>

          <Panel title={J.psychology} icon={<Brain className="h-4 w-4" />}>
            <KV items={[
              [L.form.emotionBefore, t.emotion_before],
              [L.form.emotionDuring, t.emotion_during],
              [L.form.emotionAfter, t.emotion_after],
              [L.form.confidence, t.confidence ? <span className="num">{t.confidence}/10</span> : null],
              ...PSYCH_FLAGS.filter(([k]) => t[k] !== null).map(([k]) => [L.labels.psych[k], <YesNo key={k} L={L} v={t[k]} invert={NEGATIVE.has(k)} />] as [string, React.ReactNode]),
            ]} emptyText={L.common.nothingRecorded} />
          </Panel>

          {(tags.length || customValues.length) ? (
            <Panel title={J.tagsFields} icon={<Tag className="h-4 w-4" />}>
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
            {tf(J.created, { a: formatInZone(t.created_at, tz), b: formatInZone(t.updated_at, tz), z: tz })}
          </p>
        </div>
      </div>
    </div>
  );
}
