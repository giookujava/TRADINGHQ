import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { Badge, Empty, Metric, PageHeader } from "@/components/ui";
import type { DailyPrep } from "@/lib/db/types";
import { fetchAll, getProfile, getRefData } from "@/lib/data/queries";
import { titleCase } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { todayInZone } from "@/lib/time/zone";

export const metadata = { title: "Daily Preparation" };

type PrepListRow = Pick<DailyPrep, "id" | "prep_date" | "instrument_id" | "daily_bias" | "expected_direction" | "bias_correct" | "followed_plan" | "reviewed_at" | "is_sample">;

export default async function PrepListPage({ searchParams }: PageProps<"/prep">) {
  const sp = await searchParams;
  const includeSample = sp.sample === "1";
  const { supabase, userId } = await requireUser();
  const [profile, ref] = await Promise.all([getProfile(supabase, userId), getRefData(supabase)]);
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
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        eyebrow="Overview"
        title="Daily preparation"
        subtitle={<>Plan the day with the four questions, then review it. Trading day in {profile.trading_timezone}: <span className="num text-fg">{today}</span></>}
        actions={
          <>
            <Link href={includeSample ? "/prep" : "/prep?sample=1"} className="btn btn-ghost">{includeSample ? "Hide sample data" : "Show sample data"}</Link>
            <Link href={`/prep/${today}`} className="btn btn-primary"><CalendarCheck className="h-4 w-4" /> Prepare today</Link>
          </>
        }
      />
      <div className="mb-4 grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="card grid grid-cols-3 gap-6 p-5">
          <Metric label="Days prepared" value={preps.length} />
          <Metric label="Bias accuracy" value={reviewed.length ? `${correct}/${reviewed.length}` : "—"}
            hint={reviewed.length ? (reviewed.length < 20 ? "small sample — keep logging" : `${Math.round((correct / reviewed.length) * 100)}% of reviewed days`) : "no reviewed days yet"} />
          <Metric label="Followed plan" value={followed.length ? `${followedYes}/${followed.length}` : "—"} hint={followed.length ? "reviewed days" : "no reviews yet"} />
        </section>
        <form action="/prep/open" method="get" className="card flex items-end gap-2 p-5">
          <label className="block flex-1"><span className="label">Jump to a date</span><input type="date" name="d" className="field" defaultValue={today} /></label>
          <button type="submit" className="btn">Open</button>
        </form>
      </div>
      {preps.length === 0 ? (
        <Empty icon={<CalendarCheck className="h-5 w-5" />} title="No preparation logged yet" action={<Link href={`/prep/${today}`} className="btn btn-primary">Prepare today</Link>}>
          Start with today’s plan and the four questions.
        </Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Date</th><th>Instrument</th><th>Bias</th><th>Expected</th><th>Bias correct</th><th>Followed plan</th><th>Review</th></tr></thead>
            <tbody>
              {preps.map((p) => (
                <tr key={p.id}>
                  <td className="num"><Link href={`/prep/${p.prep_date}?id=${p.id}`} className="font-medium hover:text-accent">{p.prep_date}</Link> {p.is_sample ? <Badge tone="warn" className="ml-1">Sample</Badge> : null}</td>
                  <td>{p.instrument_id ? <span className="font-medium">{sym.get(p.instrument_id)}</span> : <span className="text-muted">General</span>}</td>
                  <td>{titleCase(p.daily_bias)}</td>
                  <td>{titleCase(p.expected_direction)}</td>
                  <td>{p.bias_correct === null ? <span className="text-faint">—</span> : p.bias_correct ? <Badge tone="profit">✓ Yes</Badge> : <Badge tone="loss">✕ No</Badge>}</td>
                  <td>{p.followed_plan === null ? <span className="text-faint">—</span> : p.followed_plan ? <Badge tone="profit">✓ Yes</Badge> : <Badge tone="loss">✕ No</Badge>}</td>
                  <td>{p.reviewed_at ? <Badge tone="accent">Reviewed</Badge> : <Badge>Pending</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
