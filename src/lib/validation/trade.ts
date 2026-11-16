import { z } from "zod";
import {
  BIASES, ICT_FLAGS, KEY_LEVELS, PREMIUM_DISCOUNT, PSYCH_FLAGS, SESSIONS, TRADE_TYPES,
} from "@/lib/constants";
import { isoDate, optEnum, optNum, optText, optUuid, triBool, uuid } from "./common";

export const executionSchema = z.object({
  executed_local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, "Each execution needs a date and time."),
  side: z.enum(["buy", "sell"]),
  quantity: z.coerce.number().int("Contracts must be whole numbers.").positive("Contracts must be > 0.").max(10000),
  price: z.coerce.number().positive("Price must be > 0."),
  fees: z.coerce.number().min(0, "Fees cannot be negative.").max(100000),
});
export type ExecutionInputForm = z.infer<typeof executionSchema>;

const flagShape = Object.fromEntries([...ICT_FLAGS, ...PSYCH_FLAGS].map(([k]) => [k, triBool])) as Record<
  (typeof ICT_FLAGS)[number][0] | (typeof PSYCH_FLAGS)[number][0],
  typeof triBool
>;
const levelShape = Object.fromEntries(KEY_LEVELS.map(([k]) => [k, optNum])) as Record<(typeof KEY_LEVELS)[number][0], typeof optNum>;

export const tradeFormSchema = z.object({
  id: optUuid,
  account_id: uuid,
  instrument_id: uuid,
  strategy_id: optUuid,
  trade_date: isoDate,
  session: optEnum(SESSIONS),
  trade_type: z.enum(TRADE_TYPES),
  stop_loss: optNum,
  take_profit: optNum,
  planned_risk_override: optNum.refine((v) => v == null || v > 0, "Planned risk must be > 0."),
  adjustment_fees: optNum.transform((v) => v ?? 0).refine((v) => v >= 0, "Adjustment fees cannot be negative."),
  daily_bias: optEnum(BIASES),
  htf_bias: optEnum(BIASES),
  market_structure: optText(500),
  buy_side_liquidity: optText(500),
  sell_side_liquidity: optText(500),
  premium_discount: optEnum(PREMIUM_DISCOUNT),
  kill_zone: optText(100),
  entry_confirmation: optText(500),
  analysis_notes: optText(),
  emotion_before: optText(200),
  emotion_during: optText(200),
  emotion_after: optText(200),
  confidence: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(1).max(10).nullable()),
  mistakes: optText(),
  lessons: optText(),
  notes: optText(20000),
  ...flagShape,
  ...levelShape,
});
export type TradeForm = z.infer<typeof tradeFormSchema>;
