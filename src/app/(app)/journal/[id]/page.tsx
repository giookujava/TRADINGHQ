import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/action-form";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { ICT_FLAGS, KEY_LEVELS, PSYCH_FLAGS, SCREENSHOT_BUCKET, SCREENSHOT_PHASES, SESSION_LABELS, TRADE_TYPE_LABELS } from "@/lib/constants";
import { formatDuration } from "@/lib/calc/trade";
import { supabaseEnv } from "@/lib/env";
import { fmtMoney, fmtNum, fmtPrice, fmtR, pnlTone, titleCase } from "@/lib/format";
import { getProfile, getRefData } from "@/lib/data/queries";
import { getTradeDetail } from "@/lib/data/trade-detail";
import { requireUser } from "@/lib/supabase/server";
import { formatInZone } from "@/lib/time/zone";
import { uuid } from "@/lib/validation/common";
import { deleteTrade } from "../actions";
import { ScreenshotCard, ScreenshotUploader } from "./screenshots";

export const metadata = { title: "Trade" };

const yesNo = (v: boolean | null) => (v === true ? "Yes" : v === false ? "No" : null);

function KV({ items }: { items: [string, React.ReactNode][] }) {
  const shown = items.filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (!shown.length) return <p className="text-sm text-faint">Nothing recorded.</p>;
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {shown.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-line/50 pb-1.5">
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
      <div className="label">{label}</div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
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

  const signed = screenshots.length
    ? (await supabase.storage.from(SCREENSHOT_BUCKET).createSignedUrls(screenshots.map((s) => s.storage_path), 3600)).data ?? []
    : [];
  const urlFor = (path: string) => signed.find((s) => s.path === path)?.signedUrl ?? null;
  const fmt = (iso: string, zone: string) => formatInZone(iso, zone, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

  const customValues = ref.customFields
    .filter((c) => t.custom_fields?.[c.id] !== undefined)
    .map((c) => [c.name, typeof t.custom_fields[c.id] === "boolean" ? (t.custom_fields[c.id] ? "Yes" : "No") : String(t.custom_fields[c.id])] as [string, string]);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title={`${instrument?.symbol ?? "?"} ${t.direction === "long" ? "Long" : "Short"} · ${t.trade_date}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone={t.direction === "long" ? "profit" : "loss"}>{t.direction}</Badge>
            <Badge>{TRADE_TYPE_LABELS[t.trade_type]}</Badge>
            {t.session ? <Badge>{SESSION_LABELS[t.session]}</Badge> : null}
            {t.status === "open" ? <Badge tone="warn">Open</Badge> : null}
            {t.is_sample ? <Badge tone="warn">Sample data</Badge> : null}
            {t.source !== "manual" ? <Badge tone="accent">{t.source}</Badge> : null}
            <span className="text-muted">{account?.name}{strategy ? ` · ${strategy.name}` : ""}</span>
          </span>
        }
        actions={
          <>
            <Link href="/journal" className="btn">← Journal</Link>
            <Link href={`/prep/${t.trade_date}`} className="btn">Daily prep</Link>
            <Link href={`/journal/${t.id}/edit`} className="btn btn-primary">Edit</Link>
            <form action={deleteTrade}>
              <input type="hidden" name="id" value={t.id} />
              <SubmitButton className="btn-danger" confirm="Delete this trade, its executions and screenshots permanently?">Delete</SubmitButton>
            </form>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Net P/L" value={fmtMoney(t.net_pnl, "USD", true)} tone={pnlTone(t.net_pnl)} />
        <Stat label="Gross P/L" value={fmtMoney(t.gross_pnl)} tone={pnlTone(t.gross_pnl)} />
        <Stat label="Fees" value={fmtMoney(t.total_fees)} />
        <Stat label="R multiple" value={fmtR(t.r_multiple)} tone={pnlTone(t.r_multiple)} hint={t.planned_risk ? `risk ${fmtMoney(t.planned_risk)}` : "no stop / risk set"} />
        <Stat label="Avg entry" value={fmtPrice(t.avg_entry_price)} />
        <Stat label="Avg exit" value={fmtPrice(t.avg_exit_price)} />
        <Stat label="Contracts" value={t.max_position ?? "—"} hint={`pts/ct ${fmtNum(t.points, 4)}`} />
        <Stat label="Duration" value={formatDuration(t.holding_seconds)} />
      </div>

      <Card title={`Executions · ${tz}${tz2 ? ` / ${tz2}` : ""}`}>
        <div className="-m-4 overflow-x-auto">
          <table className="table">
            <thead><tr><th>Time ({tz.split("/").pop()?.replace("_", " ")})</th>{tz2 ? <th>{tz2.split("/").pop()}</th> : null}<th>Side</th><th className="text-right">Contracts</th><th className="text-right">Price</th><th className="text-right">Fees</th></tr></thead>
            <tbody>
              {executions.map((e) => (
                <tr key={e.id}>
                  <td className="num">{fmt(e.executed_at, tz)}</td>
                  {tz2 ? <td className="num text-muted">{fmt(e.executed_at, tz2)}</td> : null}
                  <td className={`num font-semibold uppercase ${e.side === "buy" ? "text-profit" : "text-loss"}`}>{e.side}</td>
                  <td className="num text-right">{e.quantity}</td>
                  <td className="num text-right">{fmtPrice(e.price)}</td>
                  <td className="num text-right">{fmtMoney(e.fees)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="num mt-6 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
          <span>Stop {fmtPrice(t.stop_loss)}</span>
          <span>Target {fmtPrice(t.take_profit)}</span>
          {t.adjustment_fees ? <span>Other fees {fmtMoney(t.adjustment_fees)}</span> : null}
          {instrument ? <span>{instrument.symbol} ${fmtNum(Number(instrument.point_value))}/pt</span> : null}
        </div>
      </Card>

      <Card title="Screenshots">
        <ScreenshotUploader tradeId={t.id} userId={userId} supabaseUrl={env.url} supabaseKey={env.key} />
        {screenshots.length ? (
          <div className="mt-4 space-y-4">
            {SCREENSHOT_PHASES.map((ph) => {
              const list = screenshots.filter((s) => s.phase === ph);
              if (!list.length) return null;
              return (
                <div key={ph}>
                  <div className="label">{titleCase(ph)} {ph !== "other" ? "the trade" : ""}</div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {list.map((s) => <ScreenshotCard key={s.id} shot={s} url={urlFor(s.storage_path)} />)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm text-faint">No screenshots yet.</p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Market analysis">
          <KV items={[
            ["Daily bias", t.daily_bias ? titleCase(t.daily_bias) : null],
            ["HTF bias", t.htf_bias ? titleCase(t.htf_bias) : null],
            ["Market structure", t.market_structure],
            ["Premium / discount", t.premium_discount ? titleCase(t.premium_discount) : null],
            ["Kill zone", t.kill_zone],
            ...KEY_LEVELS.map(([k, l]) => [l, t[k] != null ? <span key={k} className="num">{fmtPrice(t[k])}</span> : null] as [string, React.ReactNode]),
            ["Buy-side liquidity", t.buy_side_liquidity],
            ["Sell-side liquidity", t.sell_side_liquidity],
            ["Entry confirmation", t.entry_confirmation],
            ...ICT_FLAGS.map(([k, l]) => [l, yesNo(t[k])] as [string, React.ReactNode]),
          ]} />
          <div className="mt-3"><Prose label="Analysis notes" text={t.analysis_notes} /></div>
        </Card>
        <Card title="Psychology & execution">
          <KV items={[
            ["Emotion before", t.emotion_before],
            ["Emotion during", t.emotion_during],
            ["Emotion after", t.emotion_after],
            ["Confidence", t.confidence ? `${t.confidence}/10` : null],
            ...PSYCH_FLAGS.map(([k, l]) => [l, yesNo(t[k])] as [string, React.ReactNode]),
          ]} />
          <div className="mt-3 space-y-3">
            <Prose label="Mistakes" text={t.mistakes} />
            <Prose label="Lessons" text={t.lessons} />
          </div>
        </Card>
      </div>

      {(tags.length || customValues.length || t.notes) ? (
        <Card title="Tags, fields & notes">
          {tags.length ? (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {tags.map((g) => (
                <span key={g.id} className="inline-flex items-center gap-1.5 rounded border border-line px-2 py-0.5 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: g.color }} />{g.name}
                </span>
              ))}
            </div>
          ) : null}
          {customValues.length ? <div className="mb-3"><KV items={customValues} /></div> : null}
          <Prose label="Notes" text={t.notes} />
        </Card>
      ) : null}

      <p className="text-[11px] text-faint">
        Created {formatInZone(t.created_at, tz)} · updated {formatInZone(t.updated_at, tz)} ({tz})
      </p>
    </div>
  );
}
