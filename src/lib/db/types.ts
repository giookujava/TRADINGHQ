/**
 * Row types mirroring supabase/migrations/0001_phase1_foundation.sql.
 * Postgres `numeric` arrives from PostgREST as a JSON number.
 * Keep in sync with the migration when columns change.
 */
import type { AccountType, Bias, CustomFieldType, ScreenshotPhase, TagCategory, TradeType } from "@/lib/constants";
import type { SessionKey } from "@/lib/time/zone";

type Ts = string;
type Num = number;

export interface Profile {
  id: string;
  display_name: string | null;
  trading_timezone: string;
  display_timezone: string | null;
  currency: string;
  default_instrument_id: string | null;
  ai_enabled?: boolean;
  ai_model?: string;
  ai_monthly_budget_usd?: number;
  created_at: Ts;
  updated_at: Ts;
}

export interface Instrument {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  exchange: string;
  tick_size: Num;
  tick_value: Num;
  point_value: Num;
  currency: string;
  commission_per_side: Num;
  exchange_fee_per_side: Num;
  is_active: boolean;
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  account_type: AccountType;
  broker: string;
  platform: string;
  external_account_id: string | null;
  currency: string;
  starting_balance: Num;
  is_active: boolean;
  is_sample: boolean;
  notes: string;
  prop_firm: string | null;
  account_size: Num | null;
  profit_target: Num | null;
  daily_loss_limit: Num | null;
  max_drawdown: Num | null;
  drawdown_type: "static" | "trailing" | "eod_trailing" | null;
  status: "active" | "passed" | "failed" | "funded" | "closed";
}

export interface Strategy {
  id: string;
  user_id: string;
  name: string;
  description: string;
  is_active: boolean;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  category: TagCategory;
  color: string;
}

export interface CustomFieldDefinition {
  id: string;
  user_id: string;
  name: string;
  field_type: CustomFieldType;
  options: string[];
  sort_order: number;
  is_active: boolean;
}

export interface TradeRow {
  id: string;
  user_id: string;
  account_id: string;
  instrument_id: string;
  strategy_id: string | null;
  trade_date: string;
  direction: "long" | "short";
  status: "open" | "closed";
  session: SessionKey | null;
  trade_type: TradeType;
  stop_loss: Num | null;
  take_profit: Num | null;
  planned_risk_override: Num | null;
  adjustment_fees: Num;
  entry_time: Ts | null;
  exit_time: Ts | null;
  avg_entry_price: Num | null;
  avg_exit_price: Num | null;
  max_position: number | null;
  total_entry_qty: number | null;
  total_exit_qty: number | null;
  points: Num | null;
  gross_pnl: Num | null;
  total_fees: Num | null;
  net_pnl: Num | null;
  planned_risk: Num | null;
  r_multiple: Num | null;
  holding_seconds: number | null;
  daily_bias: Bias | null;
  htf_bias: Bias | null;
  market_structure: string | null;
  pdh: Num | null; pdl: Num | null; pwh: Num | null; pwl: Num | null;
  asia_high: Num | null; asia_low: Num | null; london_high: Num | null; london_low: Num | null;
  liquidity_sweep: boolean | null;
  buy_side_liquidity: string | null;
  sell_side_liquidity: string | null;
  displacement: boolean | null;
  mss: boolean | null;
  bos: boolean | null;
  fvg: boolean | null;
  order_block: boolean | null;
  premium_discount: "premium" | "discount" | "equilibrium" | null;
  smt_divergence: boolean | null;
  kill_zone: string | null;
  entry_confirmation: string | null;
  tf_alignment: boolean | null;
  analysis_notes: string | null;
  emotion_before: string | null;
  emotion_during: string | null;
  emotion_after: string | null;
  confidence: number | null;
  was_planned: boolean | null;
  followed_rules: boolean | null;
  entered_early: boolean | null;
  exited_early: boolean | null;
  moved_stop: boolean | null;
  revenge_trade: boolean | null;
  overtraded: boolean | null;
  mistakes: string | null;
  lessons: string | null;
  notes: string | null;
  custom_fields: Record<string, string | number | boolean | null>;
  source: "manual" | "csv" | "tradovate";
  external_id: string | null;
  is_sample: boolean;
  created_at: Ts;
  updated_at: Ts;
}

export interface ExecutionRow {
  id: string;
  user_id: string;
  trade_id: string;
  executed_at: Ts;
  side: "buy" | "sell";
  quantity: number;
  price: Num;
  fees: Num;
  source: "manual" | "csv" | "tradovate";
  external_id: string | null;
}

export interface ScreenshotRow {
  id: string;
  user_id: string;
  trade_id: string;
  storage_path: string;
  phase: ScreenshotPhase;
  caption: string;
  sort_order: number;
  created_at: Ts;
}

export interface DailyPrep {
  id: string;
  user_id: string;
  prep_date: string;
  instrument_id: string | null;
  daily_bias: Bias | null;
  htf_analysis: string | null;
  liquidity_levels: string | null;
  expected_direction: "up" | "down" | "range" | "unclear" | null;
  liquidity_targets: string | null;
  pdh: Num | null; pdl: Num | null; pwh: Num | null; pwl: Num | null;
  asia_high: Num | null; asia_low: Num | null; london_high: Num | null; london_low: Num | null;
  economic_news: string | null;
  expected_volatility: "low" | "normal" | "high" | null;
  planned_session: SessionKey | null;
  potential_setups: string | null;
  observations: string | null;
  trading_plan: string | null;
  q_where_to: string | null;
  q_where_from: string | null;
  q_why: string | null;
  q_when: string | null;
  actual_outcome: string | null;
  bias_correct: boolean | null;
  target_reached: boolean | null;
  setup_correct: boolean | null;
  followed_plan: boolean | null;
  could_improve: string | null;
  lessons_today: string | null;
  reviewed_at: Ts | null;
  is_sample: boolean;
  created_at: Ts;
  updated_at: Ts;
}

export interface AccountTransaction {
  id: string;
  user_id: string;
  account_id: string;
  occurred_on: string;
  kind: "deposit" | "withdrawal" | "payout" | "platform_fee" | "data_fee" | "other_expense" | "adjustment";
  amount: Num;
  notes: string;
  source: string;
  external_id: string | null;
  is_sample: boolean;
  created_at: Ts;
}

export interface KnowledgeEntry {
  id: string;
  user_id: string;
  title: string;
  kind: "concept" | "strategy" | "entry_model" | "rule" | "lesson" | "note" | "example";
  body: string;
  concept_key: "liquidity_sweep" | "displacement" | "mss" | "bos" | "fvg" | "order_block" | "smt_divergence" | "tf_alignment" | null;
  strategy_id: string | null;
  tag_id: string | null;
  pinned: boolean;
  created_at: Ts;
  updated_at: Ts;
}

export interface AiConversation { id: string; user_id: string; title: string; created_at: Ts; updated_at: Ts }

export interface AiMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  meta: { tools?: string[]; tradeIds?: string[]; error?: string };
  model: string | null;
  input_tokens: number;
  cached_tokens: number;
  output_tokens: number;
  cost_usd: Num;
  created_at: Ts;
}
