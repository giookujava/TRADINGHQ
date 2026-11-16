"use client";
import {
  Bot, BookOpen, CalendarCheck, ChartColumn, ChevronsLeft, ChevronsRight, LayoutDashboard, Library, Settings, Wallet, X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { setSidebarCollapsed } from "@/lib/theme";
import { cx } from "./ui";

type Item = { href: string; label: string; icon: typeof LayoutDashboard; phase?: number };
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/journal", label: "Trade Journal", icon: BookOpen },
      { href: "/prep", label: "Daily Preparation", icon: CalendarCheck },
    ],
  },
  {
    title: "Analysis",
    items: [
      { href: "/analytics", label: "Analytics", icon: ChartColumn, phase: 2 },
      { href: "/knowledge", label: "Strategy & Knowledge", icon: Library, phase: 2 },
    ],
  },
  {
    title: "Management",
    items: [
      { href: "/finance", label: "Financial Management", icon: Wallet, phase: 2 },
      { href: "/assistant", label: "AI Assistant", icon: Bot, phase: 3 },
    ],
  },
  { title: "System", items: [{ href: "/settings", label: "Settings", icon: Settings }] },
];

function Clock({ tz }: { tz: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setNow(new Date()), 0);
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);
  const city = tz.split("/").pop()!.replace(/_/g, " ");
  const time = now ? new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now) : "--:--";
  const day = now ? new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now) : "";
  return (
    <div className="flex items-center justify-between text-xs" title={tz}>
      <span className="truncate text-faint">{city}</span>
      <span className="num text-muted">{day} {time}</span>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="TRADING HQ home">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg">
        <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12 6 7.5l3 2.5L14 4" />
          <path d="M10.5 4H14v3.5" />
        </svg>
      </span>
      <span className="text-[13px] font-semibold tracking-[0.14em] collapsed:md:hidden">
        TRADING <span className="text-accent">HQ</span>
      </span>
    </Link>
  );
}

export function Sidebar({ tradingTz, displayTz, mobileOpen, onClose }: {
  tradingTz: string; displayTz: string | null; mobileOpen: boolean; onClose: () => void;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <>
      <div
        className={cx("fixed inset-0 z-30 bg-black/40 transition-opacity md:hidden", mobileOpen ? "opacity-100" : "pointer-events-none opacity-0")}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-bg-elev transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
          "md:w-60 collapsed:md:w-[68px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-14 items-center justify-between px-4 collapsed:md:justify-center collapsed:md:px-0">
          <Brand />
          <button type="button" className="btn btn-ghost btn-icon md:hidden" onClick={onClose} aria-label="Close navigation">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {GROUPS.map((g) => (
            <div key={g.title} className="mb-4">
              <div className="eyebrow mb-1.5 px-2.5 collapsed:md:hidden">{g.title}</div>
              <div className="mx-2 mb-2 hidden border-t border-line collapsed:md:block" />
              <ul className="space-y-0.5">
                {g.items.map(({ href, label, icon: Icon, phase }) =>
                  phase ? (
                    <li key={href}>
                      <span
                        className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-faint collapsed:md:justify-center"
                        title={`${label} — planned for Phase ${phase}, not built yet`}
                        aria-disabled
                      >
                        <Icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                        <span className="flex-1 truncate collapsed:md:hidden">{label}</span>
                        <span className="rounded border border-line px-1 text-[10px] font-medium collapsed:md:hidden">P{phase}</span>
                      </span>
                    </li>
                  ) : (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={onClose}
                        title={label}
                        aria-current={isActive(href) ? "page" : undefined}
                        className={cx(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors collapsed:md:justify-center",
                          isActive(href) ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="truncate collapsed:md:hidden">{label}</span>
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </nav>

        <div className="space-y-1.5 border-t border-line px-4 py-3 collapsed:md:hidden">
          <Clock tz={tradingTz} />
          {displayTz && displayTz !== tradingTz ? <Clock tz={displayTz} /> : null}
        </div>
        <div className="hidden border-t border-line p-2 md:block">
          <button
            type="button"
            className="btn btn-ghost btn-sm w-full justify-start text-faint collapsed:justify-center"
            onClick={() => setSidebarCollapsed(document.documentElement.dataset.sidebar !== "collapsed")}
            aria-label="Collapse or expand sidebar"
          >
            <ChevronsLeft className="h-4 w-4 collapsed:hidden" aria-hidden />
            <ChevronsRight className="hidden h-4 w-4 collapsed:block" aria-hidden />
            <span className="collapsed:hidden">Collapse</span>
          </button>
        </div>
      </aside>
    </>
  );
}
