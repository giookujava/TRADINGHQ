"use client";
import { TriangleAlert } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { cx } from "@/components/ui";
import { fmtMoney, fmtNum, fmtPct, fmtR } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";

export interface ExplorerRow { key: string; label: string; n: number; lowSample: boolean; winRate: number | null; netPnl: number; avgR: number | null; expectancy: number | null; profitFactor: number | null }
export interface ExplorerDim { id: string; label: string; rows: ExplorerRow[] }

/** Breakdown explorer: pick a dimension, see every group with its sample size. */
export function BreakdownExplorer({ dims }: { dims: ExplorerDim[] }) {
  const t = useT();
  const A = t.analytics;
  const [dim, setDim] = useState(dims[0]?.id ?? "");
  const cur = dims.find((d) => d.id === dim) ?? dims[0];
  const max = Math.max(1, ...(cur?.rows ?? []).map((r) => Math.abs(r.netPnl)));
  return (
    <section className="card">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div>
          <h2 className="text-base font-bold">{A.breakdown}</h2>
          <p className="mt-0.5 text-xs text-muted">{A.breakdownHint}</p>
        </div>
        <select value={dim} onChange={(e) => setDim(e.target.value)} className="field h-10 w-auto min-w-56" aria-label={A.dimension}>
          {dims.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </header>
      <div className="mt-4 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>{cur?.label}</th><th className="text-right">n</th><th className="text-right">{t.dashboard.winRate}</th>
              <th className="text-right">{t.dashboard.netPnl}</th><th className="w-40" /><th className="text-right">{t.dashboard.avgR}</th>
              <th className="text-right">{t.dashboard.expectancy}</th><th className="text-right">PF</th>
            </tr>
          </thead>
          <tbody>
            {cur?.rows.map((r) => (
              <tr key={r.key}>
                <td className="font-semibold">
                  {r.label}
                  {r.lowSample ? <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-warn-soft px-1.5 py-0.5 text-[10px] font-semibold text-warn" title={A.lowSampleHint}><TriangleAlert className="h-3 w-3" />{A.lowSample}</span> : null}
                </td>
                <td className="num text-right">{r.n}</td>
                <td className="num text-right">{fmtPct(r.winRate)}</td>
                <td className={cx("num text-right font-semibold", r.netPnl > 0 && "text-profit", r.netPnl < 0 && "text-loss")}>{fmtMoney(r.netPnl, "USD", true)}</td>
                <td>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                    <div className={cx("h-full rounded-full", r.netPnl >= 0 ? "bg-profit" : "bg-loss")} style={{ width: `${(Math.abs(r.netPnl) / max) * 100}%` }} />
                  </div>
                </td>
                <td className="num text-right">{fmtR(r.avgR)}</td>
                <td className="num text-right">{fmtMoney(r.expectancy, "USD", true)}</td>
                <td className="num text-right">{r.profitFactor == null ? "—" : fmtNum(r.profitFactor)}</td>
              </tr>
            ))}
            {!cur?.rows.length ? <tr><td colSpan={8} className="py-8 text-center text-sm text-faint">{A.noData}</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-4 text-xs text-faint">{fmt(A.causationNote, { n: 10 })}</p>
    </section>
  );
}

export interface DimOptions { id: string; label: string; values: { key: string; label: string }[] }

/** Choose a preset comparison or build "A vs B" from any dimension value. URL-driven. */
export function CompareControls({ dims, presets, current }: {
  dims: DimOptions[]; presets: { id: string; label: string }[]; current: { preset?: string; a?: string; b?: string };
}) {
  const t = useT();
  const A = t.analytics;
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [aDim, setADim] = useState(current.a?.split(":")[0] ?? dims[0]?.id ?? "");
  const [aVal, setAVal] = useState(current.a?.split(":").slice(1).join(":") ?? "");
  const [bDim, setBDim] = useState(current.b?.split(":")[0] ?? dims[0]?.id ?? "");
  const [bVal, setBVal] = useState(current.b?.split(":").slice(1).join(":") ?? "");
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
  };
  const sel = "field h-10 text-[13px]";
  const valuesOf = (id: string) => dims.find((d) => d.id === id)?.values ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button key={p.id} type="button" onClick={() => go({ cmp: p.id, a: null, b: null })}
            className={cx("chip h-9 rounded-xl text-xs", current.preset === p.id && !current.a && "border-accent bg-accent-soft text-accent")}>
            {p.label}
          </button>
        ))}
      </div>
      <form className="grid gap-2 md:grid-cols-[1fr_1fr_auto_1fr_1fr_auto] md:items-end"
        onSubmit={(e) => { e.preventDefault(); if (aVal && bVal) go({ cmp: null, a: `${aDim}:${aVal}`, b: `${bDim}:${bVal}` }); }}>
        <label className="block"><span className="label">A · {A.dimension}</span>
          <select className={sel} value={aDim} onChange={(e) => { setADim(e.target.value); setAVal(""); }}>{dims.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
        <label className="block"><span className="label">A · {A.value}</span>
          <select className={sel} value={aVal} onChange={(e) => setAVal(e.target.value)}><option value="">—</option>{valuesOf(aDim).map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}</select></label>
        <span className="hidden pb-2.5 text-center text-sm font-bold text-faint md:block">vs</span>
        <label className="block"><span className="label">B · {A.dimension}</span>
          <select className={sel} value={bDim} onChange={(e) => { setBDim(e.target.value); setBVal(""); }}>{dims.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
        <label className="block"><span className="label">B · {A.value}</span>
          <select className={sel} value={bVal} onChange={(e) => setBVal(e.target.value)}><option value="">—</option>{valuesOf(bDim).map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}</select></label>
        <button type="submit" className="btn btn-primary h-10" disabled={!aVal || !bVal}>{A.compareBtn}</button>
      </form>
    </div>
  );
}
