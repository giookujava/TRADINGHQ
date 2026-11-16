"use client";
import { CircleCheck, OctagonAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cx } from "./ui";

type Toast = { id: number; tone: "success" | "error"; message: string };
const Ctx = createContext<(tone: Toast["tone"], message: string) => void>(() => {});

/** Minimal toast system (no dependency). Toasts auto-dismiss after 4s and are announced to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast["tone"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-3 text-sm shadow-pop">
            {t.tone === "success" ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-profit" aria-hidden /> : <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0 text-loss" aria-hidden />}
            <span className="min-w-0 flex-1">{t.message}</span>
            <button type="button" className="text-faint hover:text-fg" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}

/** Tab strip for client-side sections. */
export function Tabs<T extends string>({ value, onChange, items, className }: {
  value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[]; className?: string;
}) {
  return (
    <div role="tablist" className={cx("flex gap-1 overflow-x-auto border-b border-line", className)}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cx(
            "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            value === it.value ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
          )}
        >
          {it.label}
          {it.count != null ? <span className="rounded-full bg-surface-3 px-1.5 text-[11px] text-muted">{it.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Segmented control (small, inline). */
export function Segmented<T extends string>({ value, onChange, items, label }: {
  value: T; onChange: (v: T) => void; items: [T, string][]; label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
      {items.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={cx("h-6 rounded-md px-2 text-[11px] font-medium transition-colors", value === v ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg")}>
          {l}
        </button>
      ))}
    </div>
  );
}
