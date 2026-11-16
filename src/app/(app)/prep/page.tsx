import Link from "next/link";
import { Badge, Empty, PageHeader } from "@/components/ui";
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

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Daily Preparation"
        subtitle={`Trading day in ${profile.trading_timezone}: ${today}`}
        actions={
          <>
            <Link href={includeSample ? "/prep" : "/prep?sample=1"} className="btn btn-ghost btn-sm">{includeSample ? "Hide sample data" : "Show sample data"}</Link>
            <Link href={`/prep/${today}`} className="btn btn-primary">Prepare today</Link>
          </>
        }
      />
      {reviewed.length ? (
        <p className="mb-3 text-sm text-muted">
          Bias accuracy: <span className="num text-fg">{correct}/{reviewed.length}</span> reviewed days correct
          {reviewed.length < 20 ? <span className="text-faint"> — small sample, keep logging.</span> : null}
        </p>
      ) : null}
      <form action="/prep/open" method="get" className="mb-4 flex items-end gap-2">
        <label><span className="label">Open a date</span><input type="date" name="d" className="field w-44" defaultValue={today} /></label>
        <button type="submit" className="btn">Open</button>
      </form>
      {preps.length === 0 ? (
        <Empty title="No preparation logged yet">Start with today’s plan and the four questions.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Date</th><th>Instrument</th><th>Bias</th><th>Expected</th><th>Bias correct</th><th>Followed plan</th><th>Review</th></tr></thead>
            <tbody>
              {preps.map((p) => (
                <tr key={p.id}>
                  <td className="num"><Link href={`/prep/${p.prep_date}?id=${p.id}`} className="hover:text-accent">{p.prep_date}</Link> {p.is_sample ? <Badge tone="warn">Sample</Badge> : null}</td>
                  <td>{p.instrument_id ? sym.get(p.instrument_id) : <span className="text-muted">General</span>}</td>
                  <td>{titleCase(p.daily_bias)}</td>
                  <td>{titleCase(p.expected_direction)}</td>
                  <td>{p.bias_correct === null ? "—" : p.bias_correct ? <Badge tone="profit">Yes</Badge> : <Badge tone="loss">No</Badge>}</td>
                  <td>{p.followed_plan === null ? "—" : p.followed_plan ? <Badge tone="profit">Yes</Badge> : <Badge tone="loss">No</Badge>}</td>
                  <td>{p.reviewed_at ? <Badge tone="accent">Done</Badge> : <Badge>Pending</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

