"use client";
import {
  Bot, BookOpen, CalendarCheck, ChartColumn, ChevronLeft, ChevronRight, LayoutDashboard, Library, Settings, Wallet, X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { fmt } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { setSidebarCollapsed } from "@/lib/theme";
import { BrandLogo, BrandMark } from "./brand";
import { cx } from "./ui";

export interface SidebarAccount { id: string; name: string; count: number }

function initials(name: string) {
  const parts = name.replace(/[—–-]/g, " ").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

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
      <span className="truncate text-muted">{city}</span>
      <span className="num font-semibold text-fg">{day} {time}</span>
    </div>
  );
}

export function Sidebar({ tradingTz, displayTz, mobileOpen, onClose, accounts, tradeCount }: {
  tradingTz: string; displayTz: string | null; mobileOpen: boolean; onClose: () => void; accounts: SidebarAccount[]; tradeCount: number;
}) {
  const t = useT();
  const pathname = usePathname();
  const sp = useSearchParams();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const activeAccount = pathname === "/journal" ? sp.get("account") : null;

  const main = [
    { href: "/", label: t.nav.dashboard, icon: LayoutDashboard },
    { href: "/journal", label: t.nav.journal, icon: BookOpen, count: tradeCount },
    { href: "/prep", label: t.nav.prep, icon: CalendarCheck },
  ];
  const planned = [
    { label: t.nav.analytics, icon: ChartColumn, phase: 2 },
    { label: t.nav.knowledge, icon: Library, phase: 2 },
    { label: t.nav.finance, icon: Wallet, phase: 2 },
    { label: t.nav.assistant, icon: Bot, phase: 3 },
  ];
  const itemBase = "group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-[15px] font-semibold transition-colors collapsed:md:justify-center collapsed:md:px-0";

  return (
    <>
      <div className={cx("fixed inset-0 z-30 bg-black/50 transition-opacity md:hidden", mobileOpen ? "opacity-100" : "pointer-events-none opacity-0")} onClick={onClose} aria-hidden />
      <aside
        className={cx(
          "panel fixed inset-y-3 left-3 z-40 flex w-[290px] flex-col overflow-hidden transition-transform",
          "md:sticky md:top-5 md:z-auto md:h-[calc(100vh-40px)] md:translate-x-0 md:shrink-0 collapsed:md:w-[88px]",
          mobileOpen ? "translate-x-0" : "-translate-x-[110%]",
        )}
        aria-label="Main navigation"
      >
        {/* Brand + collapse */}
        <div className="flex items-center justify-between gap-2 px-6 pt-7 pb-2 collapsed:md:flex-col collapsed:md:px-0 collapsed:md:pt-6">
          <Link href="/" onClick={onClose} aria-label={t.nav.home} title={t.nav.dashboard} className="flex items-center rounded-lg">
            <BrandLogo className="h-9 collapsed:md:hidden" />
            <BrandMark className="hidden h-10 collapsed:md:flex" />
          </Link>
          <button type="button" className="btn btn-ghost btn-icon hidden text-faint md:inline-flex" title={t.nav.collapse}
            onClick={() => setSidebarCollapsed(document.documentElement.dataset.sidebar !== "collapsed")} aria-label={t.nav.collapse}>
            <ChevronLeft className="h-5 w-5 collapsed:hidden" />
            <ChevronRight className="hidden h-5 w-5 collapsed:block" />
          </button>
          <button type="button" className="btn btn-ghost btn-icon md:hidden" onClick={onClose} aria-label={t.nav.closeNav}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 pb-4 text-sm leading-snug text-muted collapsed:md:hidden">{t.nav.workspace}</div>

        <nav className="flex-1 overflow-y-auto px-4 pb-4 collapsed:md:px-3">
          <ul className="space-y-1.5">
            {main.map(({ href, label, icon: Icon, count }) => {
              const active = isActive(href) && !activeAccount;
              return (
                <li key={href}>
                  <Link href={href} onClick={onClose} title={label} aria-current={active ? "page" : undefined}
                    className={cx(itemBase, active ? "bg-accent text-accent-fg shadow-glow" : "text-fg/85 hover:bg-surface-2 hover:text-fg")}>
                    <Icon className={cx("h-5 w-5 shrink-0", active ? "" : "text-muted group-hover:text-fg")} aria-hidden />
                    <span className="flex-1 truncate collapsed:md:hidden">{label}</span>
                    {count ? (
                      <span className={cx("num rounded-full px-2 py-0.5 text-xs font-bold collapsed:md:hidden", active ? "bg-black/15" : "bg-surface-3 text-muted")}>{count}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
            <li>
              <Link href="/settings" onClick={onClose} title={t.nav.settings} aria-current={isActive("/settings") ? "page" : undefined}
                className={cx(itemBase, isActive("/settings") ? "bg-accent text-accent-fg shadow-glow" : "text-fg/85 hover:bg-surface-2 hover:text-fg")}>
                <Settings className={cx("h-5 w-5 shrink-0", isActive("/settings") ? "" : "text-muted group-hover:text-fg")} aria-hidden />
                <span className="flex-1 truncate collapsed:md:hidden">{t.nav.settings}</span>
              </Link>
            </li>
          </ul>

          <div className="mt-6">
            <div className="mb-2 px-3.5 text-sm font-semibold text-muted collapsed:md:hidden">{t.nav.accounts}</div>
            <div className="mx-3 mb-2 hidden border-t border-line collapsed:md:block" />
            {accounts.length ? (
              <ul className="space-y-1">
                {accounts.map((a) => {
                  const active = activeAccount === a.id;
                  return (
                    <li key={a.id}>
                      <Link href={`/journal?account=${a.id}`} onClick={onClose} title={a.name}
                        className={cx("flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[15px] font-semibold transition-colors collapsed:md:justify-center collapsed:md:px-0",
                          active ? "bg-accent-soft text-accent" : "text-fg/85 hover:bg-surface-2")}>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent-soft text-[11px] font-bold text-accent">{initials(a.name)}</span>
                        <span className="flex-1 truncate collapsed:md:hidden">{a.name}</span>
                        <span className="num rounded-full bg-surface-3 px-2 py-0.5 text-xs font-bold text-muted collapsed:md:hidden">{a.count}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Link href="/settings/accounts" onClick={onClose} className="block px-3.5 text-sm text-faint hover:text-accent collapsed:md:hidden">{t.nav.noAccounts} →</Link>
            )}
          </div>

          <div className="mt-6">
            <div className="mb-2 px-3.5 text-sm font-semibold text-muted collapsed:md:hidden">{t.nav.analysis} · {t.nav.management}</div>
            <div className="mx-3 mb-2 hidden border-t border-line collapsed:md:block" />
            <ul className="space-y-1">
              {planned.map(({ label, icon: Icon, phase }) => (
                <li key={label}>
                  <span className="flex cursor-not-allowed items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[15px] font-medium text-faint collapsed:md:justify-center collapsed:md:px-0"
                    title={fmt(t.nav.phase, { n: phase })} aria-disabled>
                    <Icon className="h-5 w-5 shrink-0 opacity-70" aria-hidden />
                    <span className="flex-1 truncate collapsed:md:hidden">{label}</span>
                    <span className="rounded-md border border-line px-1.5 text-[10px] font-semibold collapsed:md:hidden">P{phase}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="m-4 mt-0 space-y-1.5 rounded-2xl border border-line bg-surface-2 px-4 py-3.5 collapsed:md:hidden">
          <Clock tz={tradingTz} />
          {displayTz && displayTz !== tradingTz ? <Clock tz={displayTz} /> : null}
        </div>
      </aside>
    </>
  );
}
