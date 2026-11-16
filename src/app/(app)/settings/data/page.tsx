import { Card } from "@/components/ui";
import { requireUser } from "@/lib/supabase/server";
import { SampleDataControls } from "./sample-controls";

export const metadata = { title: "Data & backups" };

export default async function DataSettings() {
  const { supabase } = await requireUser();
  const [real, sample, preps] = await Promise.all([
    supabase.from("trades").select("id", { count: "exact", head: true }).eq("is_sample", false),
    supabase.from("trades").select("id", { count: "exact", head: true }).eq("is_sample", true),
    supabase.from("daily_preps").select("id", { count: "exact", head: true }).eq("is_sample", false),
  ]);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Export">
        <p className="mb-3 text-sm text-muted">
          Your records: <span className="num text-fg">{real.count ?? 0}</span> trades, <span className="num text-fg">{preps.count ?? 0}</span> daily preparations.
        </p>
        <div className="flex flex-wrap gap-2">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not a page */}
          <a className="btn" href="/api/export/trades?sample=1">Trades (CSV)</a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download */}
          <a className="btn" href="/api/export/executions">Executions (CSV)</a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download */}
          <a className="btn btn-primary" href="/api/export/backup">Full backup (JSON)</a>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-faint">
          The JSON backup contains every table (accounts, instruments, trades, executions, tags, screenshots metadata,
          preparations). Screenshot image files stay in Supabase Storage and are not embedded. Exports include rows
          flagged <code>is_sample</code> so nothing is silently dropped — filter that column if needed. Restore-from-backup is planned (see CLAUDE.md).
        </p>
      </Card>
      <Card title="Sample data">
        <p className="mb-3 text-sm text-muted">
          Generates 40 clearly labelled backtest trades in a separate “SAMPLE — Backtest” account plus a few sample
          preparations. They are excluded from every statistic unless you tick “Include sample data”.
        </p>
        <SampleDataControls hasSample={(sample.count ?? 0) > 0} />
      </Card>
    </div>
  );
}
