import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { Badge, Empty, Metric, PageHeader } from "@/components/ui";
import type { DailyPrep } from "@/lib/db/types";
import { fetchAll, getProfile, getRefData } from "@/lib/data/queries";
import { fmt } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/supabase/server";
import { todayInZone } from "@/lib/time/zone";

export const metadata = { title: "Daily Preparation" };

type PrepListRow = Pick<DailyPrep, "id" | "prep_date" | "instrument_id" | "daily_bias" | "expected_direction" | "bias_correct" | "followed_plan" | "reviewed_at" | "is_sample">;

export default async function PrepListPage({ searchParams }: PageProps<"/prep">) {
  const sp = await searchParams;
  const includeSample = sp.sample === "1";
  const { supabase, userId } = await requireUser();
  const [L, profile, ref] = await Promise.all([getT(), getProfile(supabase, userId), getRefData(supabase)]);
  const P = L.prep;
  const preps = await fetchAll<PrepListRow>((from, to) => {
    let q = supabase.from("daily_preps").select("id,prep_date,instrument_id,daily_bias,expected_direction,bias_correct,followed_plan,reviewed_at,is_sample");
    if (!includeSample) q = q.eq("is_sample", false);
    return q.order("prep_date", { ascending: false }).range(from, to) as never;
  }, "daily preparations");
  const today = todayInZone(profile.trading_timezone);
  const sym = new Map(ref.instruments.map((i) => [i.id, i.symbol]));
  const reviewed = preps.filter((p) => p.bias_correct !== null);
  const correct = reviewed.filter((p) => p.bias_correct).length;

  const followed = preps.filter((p) => p.followed_plan !== null);
  const followedYes = followed.filter((p) => p.followed_plan).length;
  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title={P.title}
        subtitle={<>{fmt(P.subtitle, { z: profile.trading_timezone })} <span className="num text-fg">{today}</span></>}
        actions={
          <>
            <Link href={includeSample ? "/prep" : "/prep?sample=1"} className="btn btn-ghost h-12 rounded-full">{includeSample ? P.hideSample : P.showSample}</Link>
            <Link href={`/prep/${today}`} className="btn btn-primary h-12 px-6 text-[15px]"><CalendarCheck className="h-5 w-5" /> {P.prepareToday}</Link>
          </>
        }
      />
      <div className="mb-4 grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card grid grid-cols-3 gap-6 p-6">
          <Metric label={P.daysPrepared} value={preps.length} />
          <Metric label={P.biasAccuracy} value={reviewed.length ? `${correct}/${reviewed.length}` : "—"}
            hint={reviewed.length ? (reviewed.length < 20 ? P.smallSample : fmt(P.pctReviewed, { p: Math.round((correct / reviewed.length) * 100) })) : P.noReviewed} />
          <Metric label={P.followedPlan} value={followed.length ? `${followedYes}/${followed.length}` : "—"} hint={followed.length ? P.reviewedDays : P.noReviews} />
        </section>
        <form action="/prep/open" method="get" className="card flex items-end gap-2 p-5">
          <label className="block flex-1"><span className="label">{P.jump}</span><input type="date" name="d" className="field" defaultValue={today} /></label>
          <button type="submit" className="btn h-[38px]">{P.open}</button>
        </form>
      </div>
      {preps.length === 0 ? (
        <Empty icon={<CalendarCheck className="h-5 w-5" />} title={P.emptyTitle} action={<Link href={`/prep/${today}`} className="btn btn-primary">{P.prepareToday}</Link>}>
          {P.emptyHint}
        </Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>{P.colDate}</th><th>{P.colInstrument}</th><th>{P.colBias}</th><th>{P.colExpected}</th><th>{P.colBiasCorrect}</th><th>{P.colFollowed}</th><th>{P.colReview}</th></tr></thead>
            <tbody>
              {preps.map((p) => (
                <tr key={p.id}>
                  <td className="num"><Link href={`/prep/${p.prep_date}?id=${p.id}`} className="font-medium hover:text-accent">{p.prep_date}</Link> {p.is_sample ? <Badge tone="warn" className="ml-1">{L.common.sample}</Badge> : null}</td>
                  <td>{p.instrument_id ? <span className="font-medium">{sym.get(p.instrument_id)}</span> : <span className="text-muted">{L.common.general}</span>}</td>
                  <td>{p.daily_bias ? L.labels.bias[p.daily_bias] : "—"}</td>
                  <td>{p.expected_direction ? L.labels.direction[p.expected_direction] : "—"}</td>
                  <td>{p.bias_correct === null ? <span className="text-faint">—</span> : p.bias_correct ? <Badge tone="profit">✓ {L.common.yes}</Badge> : <Badge tone="loss">✕ {L.common.no}</Badge>}</td>
                  <td>{p.followed_plan === null ? <span className="text-faint">—</span> : p.followed_plan ? <Badge tone="profit">✓ {L.common.yes}</Badge> : <Badge tone="loss">✕ {L.common.no}</Badge>}</td>
                  <td>{p.reviewed_at ? <Badge tone="accent">{L.common.reviewed}</Badge> : <Badge>{L.common.pending}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
