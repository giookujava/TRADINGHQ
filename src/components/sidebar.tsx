"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "@/app/login/actions";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", phase: null },
  { href: "/journal", label: "Trade Journal", phase: null },
  { href: "/prep", label: "Daily Preparation", phase: null },
  { href: "/analytics", label: "Analytics", phase: 2 },
  { href: "/knowledge", label: "Strategy & Knowledge", phase: 2 },
  { href: "/finance", label: "Financial Management", phase: 2 },
  { href: "/assistant", label: "AI Assistant", phase: 3 },
  { href: "/settings", label: "Settings", phase: null },
] as const;

function Clock({ tz, label }: { tz: string; label: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setNow(new Date()), 0);
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);
  const text = now
    ? new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" }).format(now)
    : "--:--";
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-faint">{label}</span>
      <span className="num text-muted">{text}</span>
    </div>
  );
}

export function Sidebar({ email, tradingTz, displayTz }: { email: string | null; tradingTz: string; displayTz: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <aside className="border-b border-line bg-panel md:sticky md:top-0 md:flex md:h-screen md:w-56 md:shrink-0 md:flex-col md:border-r md:border-b-0">
      <div className="flex items-center justify-between px-4 py-3.5">
        <Link href="/" className="text-[13px] font-semibold tracking-[0.2em]">
          TRADING <span className="text-accent">HQ</span>
        </Link>
        <button type="button" className="btn btn-ghost btn-sm md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Toggle navigation">
          {open ? "Close" : "Menu"}
        </button>
      </div>
      <nav className={cx("flex-1 px-2 pb-3 md:block", open ? "block" : "hidden")}>
        <ul className="space-y-0.5">
          {NAV.map((item) =>
            item.phase ? (
              <li key={item.href}>
                <span
                  className="flex cursor-not-allowed items-center justify-between rounded-md px-2.5 py-1.5 text-sm text-faint"
                  title={`Planned for Phase ${item.phase} — not built yet`}
                >
                  {item.label}
                  <span className="rounded border border-line px-1 text-[9px] uppercase tracking-wide">P{item.phase}</span>
                </span>
              </li>
            ) : (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cx(
                    "block rounded-md px-2.5 py-1.5 text-sm transition-colors",
                    isActive(item.href) ? "bg-panel-2 text-fg shadow-[inset_2px_0_0_var(--color-accent)]" : "text-muted hover:bg-panel-2 hover:text-fg",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ),
          )}
        </ul>
      </nav>
      <div className={cx("space-y-1.5 border-t border-line px-4 py-3 md:block", open ? "block" : "hidden")}>
        <Clock tz={tradingTz} label={tradingTz.split("/").pop()!.replace("_", " ")} />
        {displayTz && displayTz !== tradingTz ? <Clock tz={displayTz} label={displayTz.split("/").pop()!.replace("_", " ")} /> : null}
        <div className="truncate pt-1 text-[11px] text-faint" title={email ?? ""}>{email}</div>
        <form action={signOut}>
          <button type="submit" className="btn btn-ghost btn-sm -ml-2 text-muted">Sign out</button>
        </form>
      </div>
    </aside>
  );
}
