import { DURATION_ORDER, ICT_KEYS, PSYCH_KEYS } from "@/lib/calc/analytics";
import type { Dict } from "@/lib/i18n";

export interface LabelCtx {
  t: Dict;
  instruments: Map<string, string>;
  strategies: Map<string, string>;
  accounts: Map<string, string>;
  tags: Map<string, string>;
}

/** Ordered list of dimensions shown in the analytics explorer / AI tools. */
export const DIMENSION_IDS = [
  "instrument", "sessionGroup", "session", "direction", "strategy", "dailyBias", "weekday", "duration", "tradeType", "account", "tag",
  ...ICT_KEYS, ...PSYCH_KEYS,
] as const;

export function dimensionLabel(dim: string, t: Dict): string {
  const A = t.analytics.dims as Record<string, string>;
  if (dim in A) return A[dim];
  if (dim in t.labels.ict) return t.labels.ict[dim as keyof typeof t.labels.ict];
  if (dim in t.labels.psych) return t.labels.psych[dim as keyof typeof t.labels.psych];
  return dim;
}

export function valueLabel(dim: string, key: string, c: LabelCtx): string {
  const { t } = c;
  const A = t.analytics;
  if (key === "unrecorded") return A.unrecorded;
  if (key === "unset") return t.common.notSet;
  switch (dim) {
    case "instrument": return c.instruments.get(key) ?? key;
    case "strategy": return key === "none" ? t.common.none : c.strategies.get(key) ?? key;
    case "account": return c.accounts.get(key) ?? key;
    case "tag": return c.tags.get(key) ?? key;
    case "session": return (t.labels.sessions as Record<string, string>)[key] ?? key;
    case "sessionGroup": return key === "ny" ? t.filters.nyAll : (t.labels.sessions as Record<string, string>)[key] ?? key;
    case "direction": return key === "long" ? t.common.long : t.common.short;
    case "tradeType": return (t.labels.tradeTypes as Record<string, string>)[key] ?? key;
    case "dailyBias": return (t.labels.bias as Record<string, string>)[key] ?? key;
    case "weekday": return new Intl.DateTimeFormat(t.meta.intl, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 4 + Number(key))));
    case "duration": return (A.durations as Record<string, string>)[key] ?? key;
    default: return key === "yes" ? t.common.yes : key === "no" ? t.common.no : key;
  }
}

export function sortValues(dim: string, keys: string[]): string[] {
  if (dim === "duration") return [...keys].sort((a, b) => DURATION_ORDER.indexOf(a) - DURATION_ORDER.indexOf(b));
  if (dim === "weekday") return [...keys].sort((a, b) => ((Number(a) + 6) % 7) - ((Number(b) + 6) % 7));
  return keys;
}
