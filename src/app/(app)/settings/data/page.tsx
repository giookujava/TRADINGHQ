import { Card } from "@/components/ui";
import { fmt } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/supabase/server";
import { SampleDataControls } from "./sample-controls";

export const metadata = { title: "Data & backups" };

export default async function DataSettings() {
  const { supabase } = await requireUser();
  const [t, real, sample, preps] = await Promise.all([
    getT(),
    supabase.from("trades").select("id", { count: "exact", head: true }).eq("is_sample", false),
    supabase.from("trades").select("id", { count: "exact", head: true }).eq("is_sample", true),
    supabase.from("daily_preps").select("id", { count: "exact", head: true }).eq("is_sample", false),
  ]);
  const S = t.set;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title={S.export}>
        <p className="mb-4 text-sm text-muted">{fmt(S.records, { t: real.count ?? 0, p: preps.count ?? 0 })}</p>
        <div className="flex flex-wrap gap-2">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not a page */}
          <a className="btn" href="/api/export/trades?sample=1">{S.tradesCsv}</a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download */}
          <a className="btn" href="/api/export/executions">{S.execCsv}</a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download */}
          <a className="btn btn-primary" href="/api/export/backup">{S.backup}</a>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-faint">{S.exportNote}</p>
      </Card>
      <Card title={S.sampleData}>
        <p className="mb-4 text-sm text-muted">{S.sampleDesc}</p>
        <SampleDataControls hasSample={(sample.count ?? 0) > 0} />
      </Card>
    </div>
  );
}
