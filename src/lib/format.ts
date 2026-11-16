export function fmtMoney(x: number | null | undefined, currency = "USD", signed = false): string {
  if (x == null || !Number.isFinite(x)) return "—";
  const s = new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Math.abs(x));
  if (x < 0) return `−${s}`;
  return signed && x > 0 ? `+${s}` : s;
}

export function fmtNum(x: number | null | undefined, digits = 2): string {
  if (x == null || !Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(x).replace("-", "−");
}

export function fmtPrice(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6, minimumFractionDigits: 2, useGrouping: false }).format(x);
}

export function fmtPct(x: number | null | undefined, digits = 1): string {
  if (x == null || !Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

export function fmtR(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return "—";
  return `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(2)}R`;
}

export function pnlTone(x: number | null | undefined): "profit" | "loss" | null {
  if (x == null) return null;
  return x > 0 ? "profit" : x < 0 ? "loss" : null;
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
