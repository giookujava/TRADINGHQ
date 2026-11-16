"use client";
import { CircleUser, LogOut, Menu, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { signOut } from "@/app/login/actions";
import { BrandLogo } from "./brand";
import { Sidebar } from "./sidebar";
import { ThemeSwitcher } from "./theme-switcher";
import { ToastProvider } from "./toast";

function UserMenu({ email, displayName }: { email: string | null; displayName: string | null }) {
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
  const initial = (displayName || email || "?").trim().charAt(0).toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent ring-offset-2 ring-offset-bg hover:ring-2 hover:ring-[var(--ring)]"
        title="Account"
      >
        {initial}
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
          <div className="border-b border-line px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium"><CircleUser className="h-4 w-4 text-faint" />{displayName || "Signed in"}</div>
            <div className="mt-0.5 truncate text-xs text-muted">{email}</div>
          </div>
          <div className="p-1.5">
            <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-surface-2">
              <Settings className="h-4 w-4 text-faint" /> Settings
            </Link>
            <form action={signOut}>
              <button role="menuitem" type="submit" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-loss hover:bg-loss-soft">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({ children, email, displayName, tradingTz, displayTz }: {
  children: ReactNode; email: string | null; displayName: string | null; tradingTz: string; displayTz: string | null;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const onNewTrade = pathname === "/journal/new";
  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <Sidebar tradingTz={tradingTz} displayTz={displayTz} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur md:px-6 lg:px-8">
            <button type="button" className="btn btn-ghost btn-icon md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <Menu className="h-5 w-5" />
            </button>
            <Link href="/" className="flex shrink-0 items-center md:hidden" aria-label="TRADING HQ — go to Dashboard"><BrandLogo className="h-5 sm:h-6" /></Link>
            <div className="ml-auto flex items-center gap-2">
              {!onNewTrade ? (
                <Link href="/journal/new" className="btn btn-primary">
                  <Plus className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Add trade</span>
                </Link>
              ) : null}
              <ThemeSwitcher />
              <UserMenu email={email} displayName={displayName} />
            </div>
          </header>
          <main className="min-w-0 flex-1 px-4 py-6 md:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
