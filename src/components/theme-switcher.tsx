"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { applyTheme, type ThemePref } from "@/lib/theme";
import { cx } from "./ui";

const OPTIONS: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

function subscribe(cb: () => void) {
  window.addEventListener("thq-theme-change", cb);
  return () => window.removeEventListener("thq-theme-change", cb);
}
const getPref = () => (document.documentElement.dataset.themePref as ThemePref) || "system";

/** Segmented Light / Dark / System control. Preference persists in localStorage. */
export function ThemeSwitcher({ compact }: { compact?: boolean }) {
  const pref = useSyncExternalStore(subscribe, getPref, () => "system" as ThemePref);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    // Follow OS changes while in "system" mode.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if (getPref() === "system") applyTheme("system"); };
    mq.addEventListener("change", onChange);
    return () => { clearTimeout(t); mq.removeEventListener("change", onChange); };
  }, []);

  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex items-center rounded-lg border border-line bg-surface-2 p-0.5">
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && pref === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            title={`${label} theme`}
            onClick={() => applyTheme(value)}
            className={cx(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
              active ? "bg-surface text-fg shadow-card" : "text-faint hover:text-fg",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {compact ? <span className="sr-only">{label}</span> : <span className="hidden lg:inline">{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
