/**
 * Deterministic SAMPLE data for exploring the app. Everything produced here is flagged
 * is_sample = true, lives in a dedicated sample account and is excluded from statistics
 * unless the user explicitly includes sample data.
 */
import { zonedTimeToUtc } from "@/lib/time/zone";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SampleTrade {
  symbol: "MNQ" | "MES";
  trade_date: string;
  session: "london" | "ny_am" | "ny_pm";
  direction: "long" | "short";
  executions: { executed_at: string; side: "buy" | "sell"; quantity: number; price: number }[];
  stop_loss: number;
  take_profit: number;
  flags: Record<string, boolean | null>;
  daily_bias: "bullish" | "bearish";
  emotion_before: string;
  notes: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const roundTick = (x: number) => Math.round(x * 4) / 4;

export function generateSampleTrades(todayNy: string, count = 40, seed = 42): SampleTrade[] {
  const r = rng(seed);
  const out: SampleTrade[] = [];
  const day = new Date(`${todayNy}T12:00:00Z`);
  const price = { MNQ: 21000, MES: 6000 };
  while (out.length < count) {
    day.setUTCDate(day.getUTCDate() - 1);
    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const date = day.toISOString().slice(0, 10);
    const perDay = 1 + Math.floor(r() * 2);
    for (let k = 0; k < perDay && out.length < count; k++) {
      const symbol = r() < 0.65 ? "MNQ" : "MES";
      const session = r() < 0.7 ? "ny_am" : r() < 0.5 ? "london" : "ny_pm";
      const hour = session === "ny_am" ? 9 + Math.floor(r() * 2) : session === "london" ? 3 + Math.floor(r() * 2) : 14;
      const minute = Math.floor(r() * 60);
      const direction = r() < 0.55 ? "long" : "short";
      const sgn = direction === "long" ? 1 : -1;
      const base = (price[symbol] = roundTick(price[symbol] * (1 + (r() - 0.5) * 0.01)));
      const riskPts = symbol === "MNQ" ? 10 + Math.round(r() * 20) : 3 + Math.round(r() * 5);
      const followed = r() < 0.7;
      const win = r() < (followed ? 0.55 : 0.35);
      const outcomeR = win ? 0.8 + r() * 2.2 : -(0.4 + r() * 0.6);
      const qty = 1 + Math.floor(r() * 3);
      const exitPx = roundTick(base + sgn * outcomeR * riskPts);
      const t0 = zonedTimeToUtc(`${date}T${pad(hour)}:${pad(minute)}:00`, "America/New_York");
      const hold = 3 + Math.floor(r() * 50);
      const at = (mins: number) => new Date(t0.getTime() + mins * 60_000).toISOString();
      const entrySide = direction === "long" ? "buy" : "sell";
      const exitSide = direction === "long" ? "sell" : "buy";
      const executions =
        qty > 1 && win && r() < 0.6
          ? [
              { executed_at: at(0), side: entrySide, quantity: qty, price: base },
              { executed_at: at(Math.ceil(hold / 2)), side: exitSide, quantity: 1, price: roundTick(base + sgn * riskPts) },
              { executed_at: at(hold), side: exitSide, quantity: qty - 1, price: exitPx },
            ]
          : [
              { executed_at: at(0), side: entrySide, quantity: qty, price: base },
              { executed_at: at(hold), side: exitSide, quantity: qty, price: exitPx },
            ];
      out.push({
        symbol, trade_date: date, session, direction,
        executions: executions as SampleTrade["executions"],
        stop_loss: roundTick(base - sgn * riskPts),
        take_profit: roundTick(base + sgn * riskPts * 2),
        daily_bias: (r() < 0.75) === (direction === "long") ? "bullish" : "bearish",
        flags: {
          followed_rules: followed, was_planned: followed || r() < 0.3, entered_early: !followed && r() < 0.5,
          revenge_trade: !followed && r() < 0.2, moved_stop: !followed && r() < 0.25,
          fvg: r() < 0.6, displacement: r() < 0.6, mss: r() < 0.5, liquidity_sweep: r() < 0.55,
        },
        emotion_before: ["calm", "focused", "anxious", "impatient", "confident"][Math.floor(r() * 5)],
        notes: "SAMPLE DATA — generated for demonstration. Remove it in Settings → Data.",
      });
    }
  }
  return out;
}
