"use client";
import { CalendarDays, SlidersHorizontal, Wallet, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { SESSIONS, TRADE_TYPES } from "@/lib/constants";
import type { TradeFilters } from "@/lib/data/filters";
import { useT } from "@/lib/i18n/client";
import { cx } from "./ui";

interface Opt { id: string; label: string }

function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Filter controls (ICEOFF chip style). Everything lives in the URL — shareable, bookmarkable and
 * server-rendered. Primary row: date presets, account, custom range. Secondary filters in a panel.
 */
export function FilterBar({ filters, accounts, instruments, strategies, showStatus, today }: {
  filters: TradeFilters; accounts: Opt[]; instruments: Opt[]; strategies: Opt[]; showStatus?: boolean; today: string;
}) {
  const t = useT();
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
    { key: "all", label: t.common.all },
    { key: "7", label: "7D", from: addDays(today, -6) },
    { key: "30", label: "30D", from: addDays(today, -29) },
    { key: "90", label: "90D", from: addDays(today, -89) },
    { key: "ytd", label: "YTD", from: `${today.slice(0, 4)}-01-01` },
  ];
  const activePreset = !filters.to ? presets.find((p) => p.from === filters.from)?.key ?? (filters.from ? null : "all") : null;
  const sel = "field h-10 w-auto min-w-0 py-1.5 text-[13px]";

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <div role="radiogroup" aria-label={t.filters.dateRange} className="inline-flex h-11 items-center gap-1 rounded-2xl border border-line bg-surface p-1">
          {presets.map((p) => (
            <button key={p.key} type="button" role="radio" aria-checked={activePreset === p.key}
              onClick={() => go({ from: p.from, to: undefined })}
              className={cx("h-full rounded-xl px-3.5 text-sm font-bold transition-colors",
                activePreset === p.key ? "bg-accent text-accent-fg shadow-glow" : "text-muted hover:text-fg")}>
              {p.label}
            </button>
          ))}
        </div>

        <label className="chip h-11 rounded-2xl pr-1.5">
          <Wallet className="h-4 w-4 text-accent" aria-hidden />
          <select aria-label={t.filters.account} value={filters.account ?? ""} onChange={(e) => go({ account: e.target.value || undefined })}
            className="max-w-48 cursor-pointer appearance-none bg-transparent pr-1 text-sm font-semibold text-fg outline-none">
            <option value="">{t.filters.allAccounts}</option>
            {accounts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>

        <div className={cx("chip h-11 rounded-2xl", activePreset === null && "border-accent/60")}>
          <CalendarDays className="h-4 w-4 text-accent" aria-hidden />
          <input type="date" aria-label={t.filters.from} value={filters.from ?? ""} onChange={(e) => go({ from: e.target.value || undefined })}
            className="num w-[7.6rem] bg-transparent text-xs font-medium text-fg outline-none" />
          <span className="text-faint">–</span>
          <input type="date" aria-label={t.filters.to} value={filters.to ?? ""} onChange={(e) => go({ to: e.target.value || undefined })}
            className="num w-[7.6rem] bg-transparent text-xs font-medium text-fg outline-none" />
        </div>

        <button type="button" className={cx("chip h-11 rounded-2xl", (open || secondary > 0) && "border-accent/60")} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden /> {t.filters.filters}
          {secondary ? <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-fg">{secondary}</span> : null}
        </button>
        {secondary || filters.account || filters.from || filters.to ? (
          <button type="button" className="btn btn-ghost h-11 rounded-2xl text-muted" onClick={() => router.push(pathname)}>
            <X className="h-4 w-4" aria-hidden /> {t.filters.clear}
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="card mt-3 grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
          <label className="block"><span className="label">{t.filters.instrument}</span>
            <select value={filters.instrument ?? ""} onChange={(e) => go({ instrument: e.target.value || undefined })} className={cx(sel, "w-full")}>
              <option value="">{t.common.all}</option>{instruments.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">{t.filters.tradeType}</span>
            <select value={filters.type ?? ""} onChange={(e) => go({ type: e.target.value || undefined })} className={cx(sel, "w-full")}>
              <option value="">{t.common.all}</option>{TRADE_TYPES.map((x) => <option key={x} value={x}>{t.labels.tradeTypes[x]}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">{t.filters.session}</span>
            <select value={filters.session ?? ""} onChange={(e) => go({ session: e.target.value || undefined })} className={cx(sel, "w-full")}>
              <option value="">{t.common.all}</option><option value="ny">{t.filters.nyAll}</option>
              {SESSIONS.map((s) => <option key={s} value={s}>{t.labels.sessions[s]}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">{t.filters.direction}</span>
            <select value={filters.direction ?? ""} onChange={(e) => go({ direction: e.target.value || undefined })} className={cx(sel, "w-full")}>
              <option value="">{t.common.both}</option><option value="long">{t.common.long}</option><option value="short">{t.common.short}</option>
            </select>
          </label>
          <label className="block"><span className="label">{t.filters.strategy}</span>
            <select value={filters.strategy ?? ""} onChange={(e) => go({ strategy: e.target.value || undefined })} className={cx(sel, "w-full")}>
              <option value="">{t.common.all}</option>{strategies.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          {showStatus ? (
            <label className="block"><span className="label">{t.filters.status}</span>
              <select value={filters.status ?? ""} onChange={(e) => go({ status: e.target.value || undefined })} className={cx(sel, "w-full")}>
                <option value="">{t.common.all}</option><option value="closed">{t.common.closed}</option><option value="open">{t.common.open_}</option>
              </select>
            </label>
          ) : null}
          <label className="col-span-2 inline-flex items-center gap-2 self-end pb-2 text-sm text-muted sm:col-span-1">
            <input type="checkbox" checked={filters.sample} onChange={(e) => go({ sample: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
            {t.filters.includeSample}
          </label>
        </div>
      ) : null}
    </div>
  );
}
