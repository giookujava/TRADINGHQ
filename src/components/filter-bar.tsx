"use client";
import { CalendarDays, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { SESSIONS, SESSION_LABELS, TRADE_TYPES, TRADE_TYPE_LABELS } from "@/lib/constants";
import type { TradeFilters } from "@/lib/data/filters";
import { cx } from "./ui";

interface Opt { id: string; label: string }

function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Filter controls. Everything lives in the URL (shareable, bookmarkable, server-rendered).
 * Primary row: account + date-range presets. Secondary filters open in a panel.
 */
export function FilterBar({ filters, accounts, instruments, strategies, showStatus, today }: {
  filters: TradeFilters; accounts: Opt[]; instruments: Opt[]; strategies: Opt[]; showStatus?: boolean; today: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const secondary = [filters.instrument, filters.type, filters.session, filters.direction, filters.strategy, filters.status, filters.sample].filter(Boolean).length;
  const [open, setOpen] = useState(secondary > 0);

  const go = (patch: Partial<Record<keyof TradeFilters, string | boolean | undefined>>) => {
    const next: Record<string, string | boolean | undefined> = { ...filters, ...patch };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (k === "sample") { if (v) params.set("sample", "1"); continue; }
      if (typeof v === "string" && v) params.set(k, v);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const presets: { key: string; label: string; from?: string }[] = [
    { key: "all", label: "All" },
    { key: "7", label: "7D", from: addDays(today, -6) },
    { key: "30", label: "30D", from: addDays(today, -29) },
    { key: "90", label: "90D", from: addDays(today, -89) },
    { key: "ytd", label: "YTD", from: `${today.slice(0, 4)}-01-01` },
  ];
  const activePreset = !filters.to ? presets.find((p) => p.from === filters.from)?.key ?? (filters.from ? null : "all") : null;
  const sel = "field h-8 w-auto min-w-0 py-1 text-[13px]";

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Account" value={filters.account ?? ""} onChange={(e) => go({ account: e.target.value || undefined })} className={cx(sel, "max-w-56")}>
          <option value="">All accounts</option>
          {accounts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>

        <div role="radiogroup" aria-label="Date range" className="inline-flex h-8 items-center rounded-lg border border-line bg-surface p-0.5 shadow-card">
          {presets.map((p) => (
            <button key={p.key} type="button" role="radio" aria-checked={activePreset === p.key}
              onClick={() => go({ from: p.from, to: undefined })}
              className={cx("h-full rounded-md px-2.5 text-xs font-medium transition-colors", activePreset === p.key ? "bg-accent-soft text-accent" : "text-muted hover:text-fg")}>
              {p.label}
            </button>
          ))}
        </div>

        <div className={cx("inline-flex h-8 items-center gap-1.5 rounded-lg border bg-surface px-2 shadow-card", activePreset === null ? "border-accent/50" : "border-line")}>
          <CalendarDays className="h-3.5 w-3.5 text-faint" aria-hidden />
          <input type="date" aria-label="From date" value={filters.from ?? ""} onChange={(e) => go({ from: e.target.value || undefined })}
            className="num w-[7.5rem] bg-transparent text-xs text-fg outline-none" />
          <span className="text-faint">–</span>
          <input type="date" aria-label="To date" value={filters.to ?? ""} onChange={(e) => go({ to: e.target.value || undefined })}
            className="num w-[7.5rem] bg-transparent text-xs text-fg outline-none" />
        </div>

        <button type="button" className={cx("btn", (open || secondary > 0) && "border-accent/50")} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filters
          {secondary ? <span className="rounded-full bg-accent px-1.5 text-[11px] text-accent-fg">{secondary}</span> : null}
        </button>
        {secondary || filters.account || filters.from || filters.to ? (
          <button type="button" className="btn btn-ghost text-muted" onClick={() => router.push(pathname)}>
            <X className="h-4 w-4" aria-hidden /> Clear
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="card mt-2 grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
          <label className="block"><span className="label">Instrument</span>
            <select value={filters.instrument ?? ""} onChange={(e) => go({ instrument: e.target.value || undefined })} className={cx(sel, "w-full")}>
              <option value="">All</option>{instruments.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Trade type</span>
            <select value={filters.type ?? ""} onChange={(e) => go({ type: e.target.value || undefined })} className={cx(sel, "w-full")}>
              <option value="">All</option>{TRADE_TYPES.map((t) => <option key={t} value={t}>{TRADE_TYPE_LABELS[t]}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Session</span>
            <select value={filters.session ?? ""} onChange={(e) => go({ session: e.target.value || undefined })} className={cx(sel, "w-full")}>
              <option value="">All</option><option value="ny">New York (all)</option>
              {SESSIONS.map((s) => <option key={s} value={s}>{SESSION_LABELS[s]}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Direction</span>
            <select value={filters.direction ?? ""} onChange={(e) => go({ direction: e.target.value || undefined })} className={cx(sel, "w-full")}>
              <option value="">Both</option><option value="long">Long</option><option value="short">Short</option>
            </select>
          </label>
          <label className="block"><span className="label">Strategy</span>
            <select value={filters.strategy ?? ""} onChange={(e) => go({ strategy: e.target.value || undefined })} className={cx(sel, "w-full")}>
              <option value="">All</option>{strategies.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          {showStatus ? (
            <label className="block"><span className="label">Status</span>
              <select value={filters.status ?? ""} onChange={(e) => go({ status: e.target.value || undefined })} className={cx(sel, "w-full")}>
                <option value="">All</option><option value="closed">Closed</option><option value="open">Open</option>
              </select>
            </label>
          ) : null}
          <label className="col-span-2 inline-flex items-center gap-2 self-end pb-1.5 text-sm text-muted sm:col-span-1">
            <input type="checkbox" checked={filters.sample} onChange={(e) => go({ sample: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
            Include sample data
          </label>
        </div>
      ) : null}
    </div>
  );
}
