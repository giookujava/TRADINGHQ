export { SESSIONS, SESSION_LABELS, type SessionKey } from "@/lib/time/zone";

export const ACCOUNT_TYPES = ["personal", "demo", "backtest", "evaluation", "funded"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  personal: "Personal",
  demo: "Demo",
  backtest: "Backtesting",
  evaluation: "Prop evaluation",
  funded: "Funded",
};

export const TRADE_TYPES = ["backtest", "demo", "evaluation", "funded", "live"] as const;
export type TradeType = (typeof TRADE_TYPES)[number];
export const TRADE_TYPE_LABELS: Record<TradeType, string> = {
  backtest: "Backtest",
  demo: "Demo",
  evaluation: "Evaluation",
  funded: "Funded",
  live: "Live",
};
/** Suggested trade type for a newly selected account. */
export const ACCOUNT_TO_TRADE_TYPE: Record<AccountType, TradeType> = {
  personal: "live",
  demo: "demo",
  backtest: "backtest",
  evaluation: "evaluation",
  funded: "funded",
};

export const BIASES = ["bullish", "bearish", "neutral"] as const;
export type Bias = (typeof BIASES)[number];

export const PREMIUM_DISCOUNT = ["premium", "discount", "equilibrium"] as const;
export const EXPECTED_DIRECTIONS = ["up", "down", "range", "unclear"] as const;
export const VOLATILITY = ["low", "normal", "high"] as const;
export const SCREENSHOT_PHASES = ["before", "during", "after", "other"] as const;
export type ScreenshotPhase = (typeof SCREENSHOT_PHASES)[number];

export const TAG_CATEGORIES = ["concept", "mistake", "condition", "custom"] as const;
export type TagCategory = (typeof TAG_CATEGORIES)[number];
export const TAG_CATEGORY_LABELS: Record<TagCategory, string> = {
  concept: "Concept",
  mistake: "Mistake",
  condition: "Market condition",
  custom: "Custom",
};

export const CUSTOM_FIELD_TYPES = ["text", "number", "boolean", "select"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

/** Boolean ICT context flags on a trade, in display order. */
export const ICT_FLAGS = [
  ["liquidity_sweep", "Liquidity sweep"],
  ["displacement", "Displacement"],
  ["mss", "Market Structure Shift (MSS)"],
  ["bos", "Break of Structure (BOS)"],
  ["fvg", "Fair Value Gap (FVG)"],
  ["order_block", "Order Block (OB)"],
  ["smt_divergence", "SMT divergence"],
  ["tf_alignment", "HTF / LTF alignment"],
] as const;

/** Boolean psychology/execution flags on a trade, in display order. */
export const PSYCH_FLAGS = [
  ["was_planned", "Trade was planned"],
  ["followed_rules", "Followed my rules"],
  ["entered_early", "Entered too early"],
  ["exited_early", "Exited too early"],
  ["moved_stop", "Moved my stop-loss"],
  ["revenge_trade", "Revenge trade"],
  ["overtraded", "Overtrading"],
] as const;

export const KEY_LEVELS = [
  ["pdh", "PDH"], ["pdl", "PDL"], ["pwh", "PWH"], ["pwl", "PWL"],
  ["asia_high", "Asia high"], ["asia_low", "Asia low"],
  ["london_high", "London high"], ["london_low", "London low"],
] as const;

export const SCREENSHOT_BUCKET = "trade-screenshots";
export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
export const SCREENSHOT_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export const KNOWLEDGE_KINDS = ["concept", "strategy", "entry_model", "rule", "lesson", "note", "example"] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];
