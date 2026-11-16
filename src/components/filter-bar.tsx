"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SESSIONS, SESSION_LABELS, TRADE_TYPES, TRADE_TYPE_LABELS } from "@/lib/constants";
import type { TradeFilters } from "@/lib/data/filters";

interface Opt { id: string; label: string }

/** GET-form filter bar: every change updates the URL, so filters are shareable and bookmarkable. */
export function FilterBar({ filters, accounts, instruments, strategies, showStatus }: {
  filters: TradeFilters; accounts: Opt[]; instruments: Opt[]; strategies: Opt[]; showStatus?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const auto = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => e.currentTarget.form?.requestSubmit();
  const sel = "field w-auto min-w-0 py-1 text-xs";
  // Navigate with only the non-empty params so URLs stay short and readable.
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(e.currentTarget)) if (typeof v === "string" && v) params.set(k, v);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };
  return (
    <form method="get" action={pathname} onSubmit={submit} className="card mb-4 flex flex-wrap items-end gap-2 p-3">
      <label className="block"><span className="label">From</span><input type="date" name="from" defaultValue={filters.from} onChange={auto} className={sel} /></label>
      <label className="block"><span className="label">To</span><input type="date" name="to" defaultValue={filters.to} onChange={auto} className={sel} /></label>
      <label className="block"><span className="label">Instrument</span>
        <select name="instrument" defaultValue={filters.instrument ?? ""} onChange={auto} className={sel}>
          <option value="">All</option>{instruments.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </label>
      <label className="block"><span className="label">Account</span>
        <select name="account" defaultValue={filters.account ?? ""} onChange={auto} className={sel}>
          <option value="">All</option>{accounts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </label>
      <label className="block"><span className="label">Type</span>
        <select name="type" defaultValue={filters.type ?? ""} onChange={auto} className={sel}>
          <option value="">All</option>{TRADE_TYPES.map((t) => <option key={t} value={t}>{TRADE_TYPE_LABELS[t]}</option>)}
        </select>
      </label>
      <label className="block"><span className="label">Session</span>
        <select name="session" defaultValue={filters.session ?? ""} onChange={auto} className={sel}>
          <option value="">All</option>
          <option value="ny">New York (all)</option>
          {SESSIONS.map((s) => <option key={s} value={s}>{SESSION_LABELS[s]}</option>)}
        </select>
      </label>
      <label className="block"><span className="label">Direction</span>
        <select name="direction" defaultValue={filters.direction ?? ""} onChange={auto} className={sel}>
          <option value="">Both</option><option value="long">Long</option><option value="short">Short</option>
        </select>
      </label>
      <label className="block"><span className="label">Strategy</span>
        <select name="strategy" defaultValue={filters.strategy ?? ""} onChange={auto} className={sel}>
          <option value="">All</option>{strategies.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </label>
      {showStatus ? (
        <label className="block"><span className="label">Status</span>
          <select name="status" defaultValue={filters.status ?? ""} onChange={auto} className={sel}>
            <option value="">All</option><option value="closed">Closed</option><option value="open">Open</option>
          </select>
        </label>
      ) : null}
      <label className="inline-flex items-center gap-1.5 pb-1.5 text-xs text-muted">
        <input type="checkbox" name="sample" value="1" defaultChecked={filters.sample} onChange={auto} /> Include sample data
      </label>
      <noscript><button type="submit" className="btn btn-sm">Apply</button></noscript>
      <Link href={pathname} className="btn btn-ghost btn-sm ml-auto">Reset</Link>
    </form>
  );
}
