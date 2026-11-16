/**
 * Futures trade calculation engine.
 *
 * A trade is a sequence of executions (fills). Everything else — direction, average
 * prices, quantities, P/L, fees, R multiple, duration — is derived here. This module is
 * pure (no I/O) and is the single source of truth for trade math.
 *
 * Rules (see docs/ARCHITECTURE.md §4):
 *  - direction = side of the first execution (buy → long, sell → short)
 *  - the running position may never cross zero (a reversal must be two trades)
 *  - realized gross P/L uses FIFO lot matching × point value
 *  - total fees = Σ execution fees + adjustment fees (fees are counted exactly once)
 *  - net = gross − total fees
 *  - planned risk = override, else |avg entry − stop| × max position × point value
 *  - R = net ÷ planned risk
 */
import { roundMoney, roundTo, sum } from "./money";

export type Side = "buy" | "sell";
export type Direction = "long" | "short";

export interface ExecutionInput {
  executedAt: string; // ISO-8601 instant (UTC)
  side: Side;
  quantity: number; // contracts, positive integer
  price: number;
  fees: number; // total fees for this fill, >= 0
}

export interface InstrumentSpec {
  pointValue: number; // $ per 1.00 point per contract
}

export interface TradeCalcInput {
  executions: ExecutionInput[];
  instrument: InstrumentSpec;
  stopLoss?: number | null;
  plannedRiskOverride?: number | null;
  adjustmentFees?: number | null;
}

export interface TradeCalcResult {
  direction: Direction;
  status: "open" | "closed";
  entryTime: string;
  exitTime: string | null;
  avgEntryPrice: number;
  avgExitPrice: number | null;
  maxPosition: number;
  openQuantity: number;
  totalEntryQty: number;
  totalExitQty: number;
  /** average points captured per closed contract (signed by profit) */
  points: number | null;
  grossPnl: number;
  totalFees: number;
  netPnl: number;
  plannedRisk: number | null;
  rMultiple: number | null;
  holdingSeconds: number | null;
}

export class TradeCalcError extends Error {}

export function sortExecutions<T extends { executedAt: string }>(executions: T[]): T[] {
  return executions
    .map((e, i) => ({ e, i, t: Date.parse(e.executedAt) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.e);
}

export function calculateTrade(input: TradeCalcInput): TradeCalcResult {
  const { instrument } = input;
  if (!input.executions.length) throw new TradeCalcError("A trade needs at least one execution.");
  if (!(instrument.pointValue > 0)) throw new TradeCalcError("Instrument point value must be positive.");

  const execs = sortExecutions(input.executions);
  for (const e of execs) {
    if (!Number.isInteger(e.quantity) || e.quantity <= 0)
      throw new TradeCalcError("Execution quantity must be a positive whole number of contracts.");
    if (!(e.price > 0)) throw new TradeCalcError("Execution price must be positive.");
    if (!(e.fees >= 0)) throw new TradeCalcError("Execution fees cannot be negative.");
    if (Number.isNaN(Date.parse(e.executedAt))) throw new TradeCalcError("Execution time is invalid.");
  }

  const direction: Direction = execs[0].side === "buy" ? "long" : "short";
  const entrySide: Side = direction === "long" ? "buy" : "sell";
  const sign = direction === "long" ? 1 : -1;

  const lots: { qty: number; price: number }[] = [];
  let position = 0;
  let maxPosition = 0;
  let entryQty = 0;
  let entryNotional = 0;
  let exitQty = 0;
  let exitNotional = 0;
  let realizedPointQty = 0; // Σ (exit − entry) × qty × sign
  let lastExitAt: string | null = null;

  for (const e of execs) {
    if (e.side === entrySide) {
      lots.push({ qty: e.quantity, price: e.price });
      position += e.quantity;
      entryQty += e.quantity;
      entryNotional += e.price * e.quantity;
      maxPosition = Math.max(maxPosition, position);
    } else {
      if (e.quantity > position) {
        throw new TradeCalcError(
          position === 0
            ? "An exit occurs while the position is flat. Split reversals into separate trades."
            : `Exit of ${e.quantity} exceeds the open position of ${position}. Split reversals into separate trades.`,
        );
      }
      let remaining = e.quantity;
      while (remaining > 0) {
        const lot = lots[0];
        const take = Math.min(lot.qty, remaining);
        realizedPointQty += (e.price - lot.price) * take * sign;
        lot.qty -= take;
        remaining -= take;
        if (lot.qty === 0) lots.shift();
      }
      position -= e.quantity;
      exitQty += e.quantity;
      exitNotional += e.price * e.quantity;
      lastExitAt = e.executedAt;
    }
  }

  const status = position === 0 ? "closed" : "open";
  const avgEntryPrice = roundTo(entryNotional / entryQty, 8);
  const avgExitPrice = exitQty > 0 ? roundTo(exitNotional / exitQty, 8) : null;

  const grossPnl = roundMoney(realizedPointQty * instrument.pointValue);
  const totalFees = roundMoney(sum(execs.map((e) => e.fees)) + (input.adjustmentFees ?? 0));
  const netPnl = roundMoney(grossPnl - totalFees);

  let plannedRisk: number | null = null;
  if (input.plannedRiskOverride != null && input.plannedRiskOverride > 0) {
    plannedRisk = roundMoney(input.plannedRiskOverride);
  } else if (input.stopLoss != null && input.stopLoss > 0) {
    const r = Math.abs(entryNotional / entryQty - input.stopLoss) * maxPosition * instrument.pointValue;
    plannedRisk = r > 0 ? roundMoney(r) : null;
  }
  const rMultiple = plannedRisk ? roundTo(netPnl / plannedRisk, 4) : null;

  const entryTime = execs[0].executedAt;
  const exitTime = status === "closed" ? lastExitAt : null;
  const holdingSeconds =
    status === "closed" && exitTime ? Math.round((Date.parse(exitTime) - Date.parse(entryTime)) / 1000) : null;

  return {
    direction,
    status,
    entryTime,
    exitTime,
    avgEntryPrice,
    avgExitPrice,
    maxPosition,
    openQuantity: position,
    totalEntryQty: entryQty,
    totalExitQty: exitQty,
    points: exitQty > 0 ? roundTo(realizedPointQty / exitQty, 6) : null,
    grossPnl,
    totalFees,
    netPnl,
    plannedRisk,
    rMultiple,
    holdingSeconds,
  };
}

/** Default fee for a fill: contracts × (commission + exchange/NFA fee) per side. */
export function defaultExecutionFee(
  quantity: number,
  spec: { commissionPerSide: number; exchangeFeePerSide: number },
): number {
  return roundMoney(quantity * (spec.commissionPerSide + spec.exchangeFeePerSide));
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const s = Math.max(0, Math.round(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}
