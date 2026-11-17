"use client";
import { ChevronDown, LogOut, Menu, Plus, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { signOut } from "@/app/login/actions";
import { useT } from "@/lib/i18n/client";
import { BrandLogo } from "./brand";
import { LanguageSwitcher } from "./language-switcher";
import { Sidebar, type SidebarAccount } from "./sidebar";
import { ThemeSwitcher, ThemeToggle } from "./theme-switcher";
import { ToastProvider } from "./toast";

function initialsOf(s: string) {
  const parts = s.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Real search: jumps to the journal filtered by the query. "/" focuses it from anywhere. */
function GlobalSearch() {
  const t = useT();
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = ref.current?.value.trim() ?? "";
    router.push(q ? `/journal?q=${encodeURIComponent(q)}` : "/journal");
  };
  return (
    <form onSubmit={submit} role="search" className="relative w-full max-w-xl">
      <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-faint" aria-hidden />
      <input ref={ref} type="search" placeholder={t.topbar.search} aria-label={t.topbar.search}
        className="h-12 w-full rounded-2xl border border-line bg-surface-2 pr-12 pl-12 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none focus:ring-3 focus:ring-[var(--ring)]" />
      <span className="kbd absolute top-1/2 right-3 hidden -translate-y-1/2 sm:inline-flex" aria-hidden>/</span>
    </form>
  );
}

function UserMenu({ email, displayName }: { email: string | null; displayName: string | null }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const name = displayName || email?.split("@")[0] || t.topbar.signedIn;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className="flex items-center gap-3 rounded-2xl py-1 pr-2 pl-1 transition-colors hover:bg-surface-2" title={email ?? ""}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fg text-[15px] font-extrabold text-bg">{initialsOf(displayName || email || "?")}</span>
        <span className="hidden min-w-0 text-left lg:block">
          <span className="block max-w-40 truncate text-[15px] font-bold leading-tight">{name}</span>
          <span className="block max-w-40 truncate text-xs text-muted">{t.topbar.trader}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-faint lg:block" aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="panel absolute right-0 z-40 mt-2 w-72 overflow-hidden">
          <div className="border-b border-line px-4 py-3.5">
            <div className="text-sm font-bold">{name}</div>
            <div className="mt-0.5 truncate text-xs text-muted">{email}</div>
          </div>
          <div className="border-b border-line px-4 py-3 sm:hidden">
            <div className="label">{t.topbar.language}</div>
            <LanguageSwitcher />
          </div>
          <div className="border-b border-line px-4 py-3">
            <div className="label">{t.topbar.theme}</div>
            <ThemeSwitcher />
          </div>
          <div className="p-1.5">
            <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-surface-2">
              <Settings className="h-4 w-4 text-faint" /> {t.nav.settings}
            </Link>
            <form action={signOut}>
              <button role="menuitem" type="submit" className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-loss hover:bg-loss-soft">
                <LogOut className="h-4 w-4" /> {t.topbar.signOut}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({ children, email, displayName, tradingTz, displayTz, accounts, tradeCount }: {
  children: ReactNode; email: string | null; displayName: string | null; tradingTz: string; displayTz: string | null;
  accounts: SidebarAccount[]; tradeCount: number;
}) {
  const t = useT();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  return (
    <ToastProvider>
      <div className="flex min-h-screen gap-5 md:p-5">
        <Sidebar tradingTz={tradingTz} displayTz={displayTz} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} accounts={accounts} tradeCount={tradeCount} />
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <header className="panel sticky top-0 z-20 flex h-[76px] items-center gap-3 rounded-none border-x-0 border-t-0 px-3 md:top-5 md:h-[88px] md:rounded-[26px] md:border md:px-5">
            <button type="button" className="btn btn-ghost btn-icon md:hidden" onClick={() => setMobileOpen(true)} aria-label={t.nav.openNav}>
              <Menu className="h-5 w-5" />
            </button>
            <Link href="/" className="flex shrink-0 items-center md:hidden" aria-label={t.nav.home}><BrandLogo className="h-6" /></Link>
            <div className="hidden flex-1 md:block"><GlobalSearch /></div>
            <div className="ml-auto flex items-center gap-2 md:gap-3">
              {pathname !== "/journal/new" ? (
                <Link href="/journal/new" className="btn btn-primary btn-icon md:hidden" aria-label={t.topbar.addTrade}><Plus className="h-5 w-5" /></Link>
              ) : null}
              <div className="hidden items-center gap-1 rounded-2xl border border-line bg-surface-2 p-1 sm:flex">
                <LanguageSwitcher className="h-9 border-0 bg-transparent p-0.5" />
                <ThemeToggle className="h-9 w-9" />
              </div>
              <UserMenu email={email} displayName={displayName} />
            </div>
          </header>
          <div className="px-4 md:hidden"><GlobalSearch /></div>
          <main className="min-w-0 flex-1 px-4 pb-8 md:px-1 md:pt-2">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
