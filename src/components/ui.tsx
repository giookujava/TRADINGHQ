import type { ReactNode } from "react";
import { Info, TriangleAlert, CircleCheck, OctagonAlert } from "lucide-react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? <div className="eyebrow mb-2">{eyebrow}</div> : null}
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight md:text-[36px]">{title}</h1>
        {subtitle ? <div className="mt-2 text-[15px] leading-relaxed text-muted">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, subtitle, actions, children, className, bodyClassName, flush }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; flush?: boolean;
}) {
  return (
    <section className={cx("card", className)}>
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-2 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cx(flush ? "" : title ? "px-5 pb-5" : "p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Compact KPI: label, large value, optional hint. No border — meant to sit inside a card. */
export function Metric({ label, value, hint, tone, size = "md" }: {
  label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: "profit" | "loss" | null; size?: "sm" | "md" | "lg" | "xl";
}) {
  const sizes = { sm: "text-base", md: "text-xl", lg: "text-2xl", xl: "text-[34px] leading-none" } as const;
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cx("num mt-1.5 font-semibold tracking-tight", sizes[size], tone === "profit" && "text-profit", tone === "loss" && "text-loss")}>{value}</div>
      {hint ? <div className="mt-1 truncate text-xs text-faint">{hint}</div> : null}
    </div>
  );
}

/** Bordered KPI tile (used for trade detail headline numbers). */
export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "profit" | "loss" | null }) {
  return (
    <div className="card px-4 py-3.5">
      <Metric label={label} value={value} hint={hint} tone={tone} />
    </div>
  );
}

/** Row in a definition list of secondary statistics. */
export function StatRow({ label, value, hint, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: "profit" | "loss" | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="min-w-0 text-sm text-muted">
        {label}
        {hint ? <span className="ml-1.5 text-xs text-faint">{hint}</span> : null}
      </dt>
      <dd className={cx("num shrink-0 text-sm font-medium", tone === "profit" && "text-profit", tone === "loss" && "text-loss")}>{value}</dd>
    </div>
  );
}

type Tone = "default" | "accent" | "profit" | "loss" | "warn";
const BADGE: Record<Tone, string> = {
  default: "bg-surface-3 text-muted",
  accent: "bg-accent-soft text-accent",
  profit: "bg-profit-soft text-profit",
  loss: "bg-loss-soft text-loss",
  warn: "bg-warn-soft text-warn",
};

export function Badge({ children, tone = "default", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-4", BADGE[tone], className)}>
      {children}
    </span>
  );
}

/** Long / Short pill: arrow + word, so direction never relies on colour alone. */
export function DirectionBadge({ direction }: { direction: "long" | "short" }) {
  return direction === "long" ? <Badge tone="profit">▲ Long</Badge> : <Badge tone="loss">▼ Short</Badge>;
}

export function Empty({ title, children, icon, action }: { title: string; children?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center">
      {icon ? <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">{icon}</div> : null}
      <div className="text-base font-bold">{title}</div>
      {children ? <div className="mt-1 max-w-md text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Notice({ children, tone = "info", className }: { children: ReactNode; tone?: "info" | "warn" | "error" | "success"; className?: string }) {
  const map = {
    info: ["bg-accent-soft text-fg", Info, "text-accent"],
    warn: ["bg-warn-soft text-fg", TriangleAlert, "text-warn"],
    error: ["bg-loss-soft text-fg", OctagonAlert, "text-loss"],
    success: ["bg-profit-soft text-fg", CircleCheck, "text-profit"],
  } as const;
  const [cls, Icon, iconCls] = map[tone];
  return (
    <div role={tone === "error" ? "alert" : undefined} className={cx("flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-sm", cls, className)}>
      <Icon className={cx("mt-0.5 h-4 w-4 shrink-0", iconCls)} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: ReactNode; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cx("block min-w-0", className)}>
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] leading-snug text-faint">{hint}</span> : null}
    </label>
  );
}

/** Small card section heading used inside long forms. */
export function SectionTitle({ children, description, icon }: { children: ReactNode; description?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-2.5">
      {icon ? <div className="mt-0.5 text-faint">{icon}</div> : null}
      <div>
        <h3 className="text-sm font-semibold">{children}</h3>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
    </div>
  );
}

/** Coloured signed P/L text with explicit + / − sign. */
export function Pnl({ value, children, className }: { value: number | null | undefined; children: ReactNode; className?: string }) {
  return <span className={cx("num", value != null && value > 0 && "text-profit", value != null && value < 0 && "text-loss", className)}>{children}</span>;
}

/** Circular progress ring (0–1). Purely presentational; value is also shown as text by the caller. */
export function Ring({ value, size = 56, stroke = 6 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${c * v} ${c}`} />
    </svg>
  );
}

/**
 * ICEOFF-style KPI card: icon + label, big value with a small secondary figure, and an optional
 * progress bar — only pass `progress` when the ratio is real (e.g. wins ÷ closed trades).
 */
export function StatCard({ icon, label, value, aside, hint, tone, progress, highlight, ring, className }: {
  icon?: ReactNode; label: ReactNode; value: ReactNode; aside?: ReactNode; hint?: ReactNode; tone?: "profit" | "loss" | null;
  progress?: number | null; highlight?: boolean; ring?: number | null; className?: string;
}) {
  return (
    <div className={cx(
      "relative flex min-w-0 flex-col justify-between gap-3 rounded-2xl border p-5",
      highlight ? "border-accent/50 bg-gradient-to-br from-accent-soft to-surface" : "border-line bg-surface",
      className,
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-fg/90">
            {icon ? <span className="text-accent">{icon}</span> : null}
            <span className="truncate">{label}</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={cx("num truncate text-[30px] font-bold leading-none tracking-tight", tone === "profit" && "text-profit", tone === "loss" && "text-loss")}>{value}</span>
            {aside ? <span className="num truncate text-xs font-medium text-muted">{aside}</span> : null}
          </div>
        </div>
        {ring != null ? <Ring value={ring} /> : null}
      </div>
      {progress != null ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
        </div>
      ) : null}
      {hint ? <div className="truncate text-xs text-muted">{hint}</div> : null}
    </div>
  );
}
