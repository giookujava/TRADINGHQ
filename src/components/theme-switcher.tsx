"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n/client";
import { applyTheme, type ThemePref } from "@/lib/theme";
import { cx } from "./ui";

function subscribe(cb: () => void) {
  window.addEventListener("thq-theme-change", cb);
  return () => window.removeEventListener("thq-theme-change", cb);
}
const getPref = () => (document.documentElement.dataset.themePref as ThemePref) || "system";
const getResolved = () => (document.documentElement.dataset.theme as "light" | "dark") || "dark";

function useFollowSystem() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if (getPref() === "system") applyTheme("system"); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
}

/** Single icon button (ICEOFF style): toggles between light and dark; preference persists. */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useT();
  const resolved = useSyncExternalStore(subscribe, getResolved, () => "dark" as const);
  const [mounted, setMounted] = useState(false);
  useFollowSystem();
  useEffect(() => { const id = setTimeout(() => setMounted(true), 0); return () => clearTimeout(id); }, []);
  const next = resolved === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => applyTheme(next)}
      className={cx("flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-fg", className)}
      title={`${t.topbar.theme}: ${next === "light" ? t.topbar.light : t.topbar.dark}`}
      aria-label={`${t.topbar.theme}: ${next === "light" ? t.topbar.light : t.topbar.dark}`}
    >
      {mounted && resolved === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
    </button>
  );
}

/** Segmented Light / Dark / System control (used in the user menu and on the login page). */
export function ThemeSwitcher({ compact }: { compact?: boolean }) {
  const t = useT();
  const pref = useSyncExternalStore(subscribe, getPref, () => "system" as ThemePref);
  const [mounted, setMounted] = useState(false);
  useFollowSystem();
  useEffect(() => { const id = setTimeout(() => setMounted(true), 0); return () => clearTimeout(id); }, []);
  const options: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
    { value: "light", label: t.topbar.light, Icon: Sun },
    { value: "dark", label: t.topbar.dark, Icon: Moon },
    { value: "system", label: t.topbar.system, Icon: Monitor },
  ];
  return (
    <div role="radiogroup" aria-label={t.topbar.theme} className="inline-flex items-center rounded-xl border border-line bg-surface-2 p-0.5">
      {options.map(({ value, label, Icon }) => {
        const active = mounted && pref === value;
        return (
          <button key={value} type="button" role="radio" aria-checked={active} title={label} onClick={() => applyTheme(value)}
            className={cx("inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors",
              active ? "bg-surface text-fg shadow-card" : "text-faint hover:text-fg")}>
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {compact ? <span className="sr-only">{label}</span> : <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
