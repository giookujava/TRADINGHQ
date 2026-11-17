import "server-only";
/**
 * Read-only tools the AI assistant may call. Each runs server-side with the signed-in user's
 * Supabase session (so RLS limits it to their own rows) and returns compact JSON computed by the
 * SAME engine as the dashboard/analytics pages. The model never gets raw database access.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bestWorstDays, compare, DIMENSIONS, drawdownStats, groupBy, ICT_KEYS, lastVsPrevious, matches, mistakes, PSYCH_KEYS, type AnalyticsTrade,
} from "@/lib/calc/analytics";
import { accountFinance } from "@/lib/calc/finance";
import { summarize } from "@/lib/calc/stats";
import { SCREENSHOT_BUCKET, SESSIONS, TRADE_TYPES } from "@/lib/constants";
import { getAnalyticsTrades, getCashflows } from "@/lib/data/analytics";
import { DIMENSION_IDS, dimensionLabel, valueLabel, type LabelCtx } from "@/lib/data/dimensions";
import type { TradeFilters } from "@/lib/data/filters";
import { getRefData, type RefData } from "@/lib/data/queries";
import { getTradeDetail } from "@/lib/data/trade-detail";
import { getDict } from "@/lib/i18n";
import { todayInZone } from "@/lib/time/zone";

const FILTER_PROPS = {
  from: { type: ["string", "null"], description: "Start date YYYY-MM-DD (trading-day date, New York), inclusive" },
  to: { type: ["string", "null"], description: "End date YYYY-MM-DD, inclusive" },
  account: { type: ["string", "null"], description: "Account name (exact) or null for all real accounts" },
  instrument: { type: ["string", "null"], description: "Instrument symbol, e.g. MNQ" },
  session: { type: ["string", "null"], enum: [...SESSIONS, "ny", null], description: "Session; 'ny' = all New York sessions" },
  direction: { type: ["string", "null"], enum: ["long", "short", null] },
  trade_type: { type: ["string", "null"], enum: [...TRADE_TYPES, null] },
  strategy: { type: ["string", "null"], description: "Strategy name (exact)" },
  include_sample: { type: ["boolean", "null"], description: "Include clearly-labelled sample data (default false)" },
} as const;
const FILTER_KEYS = Object.keys(FILTER_PROPS);

function fn(name: string, description: string, props: Record<string, unknown>, required: string[] = []) {
  const all = { ...props };
  return {
    type: "function" as const, name, description, strict: true,
    parameters: { type: "object", properties: all, required: Object.keys(all), additionalProperties: false },
    _required: required,
  };
}

export const TOOL_DEFS = [
  fn("get_overview", "Headline performance for a selection of trades: counts, win rate, net/gross, fees, avg R, expectancy, profit factor, drawdown, streaks, best/worst day, date range.", { ...FILTER_PROPS }),
  fn("get_breakdown", "Performance grouped by one dimension (each group has n and a lowSample flag).", {
    ...FILTER_PROPS,
    dimension: { type: "string", enum: [...DIMENSION_IDS], description: "Grouping dimension. ICT/psychology flags give yes / no / unrecorded groups." },
  }),
  fn("compare", "Compare two groups of trades. mode 'last_vs_previous' compares the last n closed trades to the n before; mode 'groups' compares dimension=value A vs B.", {
    ...FILTER_PROPS,
    mode: { type: "string", enum: ["last_vs_previous", "groups"] },
    n: { type: ["integer", "null"], description: "For last_vs_previous (default 30)" },
    a_dimension: { type: ["string", "null"], enum: [...DIMENSION_IDS, null] }, a_value: { type: ["string", "null"], description: "Value key, e.g. 'yes', 'ny_am', 'long', or an instrument symbol / strategy name / tag name" },
    b_dimension: { type: ["string", "null"], enum: [...DIMENSION_IDS, null] }, b_value: { type: ["string", "null"] },
  }),
  fn("list_trades", "List individual trades (newest first unless sorted) with key fields, so you can cite them by date and symbol.", {
    ...FILTER_PROPS,
    sort: { type: ["string", "null"], enum: ["date_desc", "date_asc", "net_desc", "net_asc", "r_desc", "r_asc", null] },
    limit: { type: ["integer", "null"], description: "Max 50 (default 20)" },
    only_flag: { type: ["string", "null"], enum: [...ICT_KEYS, ...PSYCH_KEYS, null], description: "Only trades where this flag is true" },
  }),
  fn("get_trade", "Full detail of one trade: executions, plan, ICT context, psychology, mistakes, lessons, notes, tags, screenshot count.", { trade_id: { type: "string" } }),
  fn("view_trade_screenshots", "Look at the chart screenshots attached to one trade (images). Use only when the user asks about screenshots/charts.", { trade_id: { type: "string" } }),
  fn("get_daily_preps", "Daily preparations (bias, the four questions, plan, end-of-day review) with the net P/L of trades that day.", {
    from: FILTER_PROPS.from, to: FILTER_PROPS.to, limit: { type: ["integer", "null"], description: "Max 30 (default 10)" },
  }),
  fn("get_mistakes", "How often each execution mistake happened (flags and mistake tags) and the P/L of those trades.", { ...FILTER_PROPS }),
  fn("search_knowledge", "Search the user's own knowledge base (concepts, strategies, rules, lessons). Use for their personal trading rules.", {
    query: { type: ["string", "null"], description: "Words to search; null returns rules and pinned entries" },
  }),
  fn("get_accounts", "Accounts with balance, trading P/L, deposits/withdrawals/fees and prop-firm rule status (profit target, daily loss, drawdown).", {}),
].map(({ _required: _r, ...d }) => { void _r; return d; });

type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

interface Ctx { db: SupabaseClient; ref: RefData; tz: string; labels: LabelCtx; tradeIds: Set<string> }

function resolveFilters(a: Args, ref: RefData): { f: TradeFilters; unknown: string[] } {
  const unknown: string[] = [];
  const f: TradeFilters = { sample: a.include_sample === true };
  const from = str(a.from), to = str(a.to);
  if (from && DATE.test(from)) f.from = from;
  if (to && DATE.test(to)) f.to = to;
  const acc = str(a.account);
  if (acc) { const m = ref.accounts.find((x) => x.name.toLowerCase() === acc.toLowerCase() || x.id === acc); if (m) f.account = m.id; else unknown.push(`account "${acc}"`); }
  const ins = str(a.instrument);
  if (ins) { const m = ref.instruments.find((x) => x.symbol.toLowerCase() === ins.toLowerCase()); if (m) f.instrument = m.id; else unknown.push(`instrument "${ins}"`); }
  const st = str(a.strategy);
  if (st) { const m = ref.strategies.find((x) => x.name.toLowerCase() === st.toLowerCase()); if (m) f.strategy = m.id; else unknown.push(`strategy "${st}"`); }
  const ses = str(a.session); if (ses) f.session = ses;
  const dir = str(a.direction); if (dir === "long" || dir === "short") f.direction = dir;
  const tt = str(a.trade_type); if (tt) f.type = tt;
  return { f, unknown };
}

/** Map a human value (symbol, strategy name, tag name) to the stored key for a dimension. */
function resolveValue(dim: string, value: string, ref: RefData): string {
  const v = value.trim();
  if (dim === "instrument") return ref.instruments.find((x) => x.symbol.toLowerCase() === v.toLowerCase())?.id ?? v;
  if (dim === "strategy") return ref.strategies.find((x) => x.name.toLowerCase() === v.toLowerCase())?.id ?? v;
  if (dim === "account") return ref.accounts.find((x) => x.name.toLowerCase() === v.toLowerCase())?.id ?? v;
  if (dim === "tag") return ref.tags.find((x) => x.name.toLowerCase() === v.toLowerCase())?.id ?? v;
  return v;
}

const r2 = (x: number | null | undefined) => (x == null ? null : Math.round(x * 100) / 100);

function period(trades: AnalyticsTrade[]) {
  const d = trades.map((x) => x.trade_date).sort();
  return d.length ? { first: d[0], last: d[d.length - 1] } : null;
}

function overview(trades: AnalyticsTrade[]) {
  const s = summarize(trades);
  const dd = drawdownStats(trades);
  const days = bestWorstDays(trades);
  return {
    period: period(trades), closed_trades: s.closedTrades, open_trades: s.openTrades, wins: s.wins, losses: s.losses, breakeven: s.breakeven,
    win_rate: r2(s.winRate), net_pnl: s.netPnl, pnl_before_fees: s.pnlBeforeFees, fees: s.totalFees, gross_profit: s.grossProfit, gross_loss: s.grossLoss,
    avg_win: s.avgWin, avg_loss: s.avgLoss, largest_win: s.largestWin, largest_loss: s.largestLoss, avg_r: s.avgR, trades_with_r: s.rSampleSize,
    expectancy: s.expectancy, profit_factor: s.profitFactor, max_consecutive_wins: s.maxConsecutiveWins, max_consecutive_losses: s.maxConsecutiveLosses,
    max_drawdown: dd.maxDrawdown, current_drawdown: dd.currentDrawdown, longest_underwater_trades: dd.longestUnderwater,
    best_day: days.best ? { date: days.best.key, net: days.best.netPnl } : null, worst_day: days.worst ? { date: days.worst.key, net: days.worst.netPnl } : null,
    trading_days: days.days, green_days: days.greenDays,
    sample_warning: s.closedTrades < 10 ? "Fewer than 10 closed trades: insufficient for conclusions." : s.closedTrades < 30 ? "Fewer than 30 closed trades: preliminary." : null,
  };
}

function tradeLine(x: AnalyticsTrade, c: Ctx) {
  c.tradeIds.add(x.id);
  const flags = Object.entries(x.flags).filter(([, v]) => v === true).map(([k]) => k);
  return {
    id: x.id, date: x.trade_date, symbol: c.labels.instruments.get(x.instrument_id), direction: x.direction, session: x.session,
    strategy: x.strategy_id ? c.labels.strategies.get(x.strategy_id) : null, account: c.labels.accounts.get(x.account_id), status: x.status,
    net: x.net_pnl, r: x.r_multiple, held_min: x.holding_seconds != null ? Math.round(x.holding_seconds / 60) : null,
    followed_rules: x.flags.followed_rules ?? null, true_flags: flags, tags: x.tag_ids.map((t) => c.labels.tags.get(t)),
  };
}

export type ToolOutput = string | ({ type: "input_text"; text: string } | { type: "input_image"; image_url: string; detail: "low" | "high" | "auto" })[];

export async function runTool(name: string, rawArgs: string, c: Ctx): Promise<ToolOutput> {
  let a: Args = {};
  try { a = JSON.parse(rawArgs || "{}"); } catch { return JSON.stringify({ error: "Invalid JSON arguments." }); }
  const out = (o: unknown) => JSON.stringify(o);

  if (FILTER_KEYS.some((k) => k in a) || ["get_overview", "get_breakdown", "compare", "list_trades", "get_mistakes"].includes(name)) {
    // handled below per tool
  }
  switch (name) {
    case "get_overview": {
      const { f, unknown } = resolveFilters(a, c.ref);
      return out({ unknown_filters: unknown, ...overview(await getAnalyticsTrades(c.db, f)) });
    }
    case "get_breakdown": {
      const { f, unknown } = resolveFilters(a, c.ref);
      const dim = str(a.dimension) ?? "instrument";
      if (!DIMENSIONS[dim]) return out({ error: `Unknown dimension ${dim}` });
      const trades = await getAnalyticsTrades(c.db, f);
      return out({
        unknown_filters: unknown, dimension: dimensionLabel(dim, c.labels.t), period: period(trades),
        groups: groupBy(trades, DIMENSIONS[dim]).map((g) => ({ value: valueLabel(dim, g.key, c.labels), n: g.n, low_sample: g.lowSample, win_rate: r2(g.winRate), net: g.netPnl, avg_r: g.avgR, expectancy: g.expectancy, profit_factor: g.profitFactor })),
        note: "Groups with low_sample=true (n<10) are not reliable. Association is not causation.",
      });
    }
    case "compare": {
      const { f, unknown } = resolveFilters(a, c.ref);
      const trades = await getAnalyticsTrades(c.db, f);
      const shape = (g: ReturnType<typeof compare>["a"]) => ({ n: g.n, low_sample: g.lowSample, win_rate: r2(g.winRate), net: g.netPnl, avg_r: g.avgR, expectancy: g.expectancy, profit_factor: g.profitFactor, avg_win: g.avgWin, avg_loss: g.avgLoss });
      if (a.mode === "last_vs_previous") {
        const n = Math.min(500, Math.max(1, Number(a.n) || 30));
        const r = lastVsPrevious(trades, n);
        return out({ unknown_filters: unknown, a_label: `last ${n} closed trades`, b_label: `previous ${n}`, a: shape(r.a), b: shape(r.b), enough_data: r.enoughData });
      }
      const ad = str(a.a_dimension), av = str(a.a_value), bd = str(a.b_dimension), bv = str(a.b_value);
      if (!ad || !av || !bd || !bv || !DIMENSIONS[ad] || !DIMENSIONS[bd]) return out({ error: "groups mode needs a_dimension, a_value, b_dimension, b_value" });
      const ka = resolveValue(ad, av, c.ref), kb = resolveValue(bd, bv, c.ref);
      const r = compare(trades.filter((x) => matches(x, ad, ka)), trades.filter((x) => matches(x, bd, kb)));
      return out({ unknown_filters: unknown, a_label: `${ad}=${av}`, b_label: `${bd}=${bv}`, a: shape(r.a), b: shape(r.b), enough_data: r.enoughData });
    }
    case "list_trades": {
      const { f, unknown } = resolveFilters(a, c.ref);
      let trades = await getAnalyticsTrades(c.db, f);
      const flag = str(a.only_flag) as keyof AnalyticsTrade["flags"] | undefined;
      if (flag) trades = trades.filter((x) => x.flags[flag] === true);
      const sort = str(a.sort) ?? "date_desc";
      const key = (x: AnalyticsTrade) => (sort.startsWith("net") ? Number(x.net_pnl ?? 0) : sort.startsWith("r") ? Number(x.r_multiple ?? -1e9) : 0);
      trades = sort.startsWith("date") ? (sort === "date_asc" ? trades : [...trades].reverse()) : [...trades].sort((p, q) => (sort.endsWith("desc") ? key(q) - key(p) : key(p) - key(q)));
      const limit = Math.min(50, Math.max(1, Number(a.limit) || 20));
      return out({ unknown_filters: unknown, total_matching: trades.length, shown: Math.min(limit, trades.length), trades: trades.slice(0, limit).map((x) => tradeLine(x, c)) });
    }
    case "get_trade": {
      const id = str(a.trade_id);
      if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return out({ error: "trade_id must be a trade id from list_trades" });
      const d = await getTradeDetail(c.db, id);
      if (!d) return out({ error: "Trade not found." });
      c.tradeIds.add(id);
      const { trade: x } = d;
      return out({
        id: x.id, date: x.trade_date, symbol: c.labels.instruments.get(x.instrument_id), direction: x.direction, status: x.status, session: x.session,
        account: c.labels.accounts.get(x.account_id), strategy: x.strategy_id ? c.labels.strategies.get(x.strategy_id) : null, trade_type: x.trade_type,
        net: x.net_pnl, gross: x.gross_pnl, fees: x.total_fees, r: x.r_multiple, planned_risk: x.planned_risk, stop: x.stop_loss, target: x.take_profit,
        avg_entry: x.avg_entry_price, avg_exit: x.avg_exit_price, max_contracts: x.max_position, held_min: x.holding_seconds != null ? Math.round(x.holding_seconds / 60) : null,
        executions: d.executions.map((e) => ({ at_utc: e.executed_at, side: e.side, qty: e.quantity, price: e.price, fees: e.fees })),
        context: { daily_bias: x.daily_bias, htf_bias: x.htf_bias, market_structure: x.market_structure, premium_discount: x.premium_discount, kill_zone: x.kill_zone, entry_confirmation: x.entry_confirmation, bsl: x.buy_side_liquidity, ssl: x.sell_side_liquidity, ...Object.fromEntries(ICT_KEYS.map((k) => [k, x[k]])) },
        psychology: { before: x.emotion_before, during: x.emotion_during, after: x.emotion_after, confidence: x.confidence, ...Object.fromEntries(PSYCH_KEYS.map((k) => [k, x[k]])) },
        analysis_notes: x.analysis_notes, mistakes: x.mistakes, lessons: x.lessons, notes: x.notes,
        tags: d.tagIds.map((t) => c.labels.tags.get(t)), screenshots: d.screenshots.map((s) => ({ phase: s.phase, caption: s.caption })),
      });
    }
    case "view_trade_screenshots": {
      const id = str(a.trade_id);
      if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return out({ error: "trade_id required" });
      const d = await getTradeDetail(c.db, id);
      if (!d) return out({ error: "Trade not found." });
      c.tradeIds.add(id);
      const shots = d.screenshots.slice(0, 6);
      if (!shots.length) return out({ screenshots: 0, note: "This trade has no screenshots." });
      const signed = (await c.db.storage.from(SCREENSHOT_BUCKET).createSignedUrls(shots.map((s) => s.storage_path), 600)).data ?? [];
      const parts: Exclude<ToolOutput, string> = [{ type: "input_text", text: `Screenshots for trade ${d.trade.trade_date} (${shots.length} of ${d.screenshots.length}):` }];
      shots.forEach((s, i) => {
        const url = signed.find((x) => x.path === s.storage_path)?.signedUrl;
        parts.push({ type: "input_text", text: `#${i + 1} phase=${s.phase} caption=${s.caption || "-"}` });
        if (url) parts.push({ type: "input_image", image_url: url, detail: "auto" });
      });
      return parts;
    }
    case "get_daily_preps": {
      const limit = Math.min(30, Math.max(1, Number(a.limit) || 10));
      let q = c.db.from("daily_preps").select("*").eq("is_sample", false).order("prep_date", { ascending: false }).limit(limit);
      const from = str(a.from), to = str(a.to);
      if (from && DATE.test(from)) q = q.gte("prep_date", from);
      if (to && DATE.test(to)) q = q.lte("prep_date", to);
      const { data } = await q;
      const preps = data ?? [];
      const dates = preps.map((p) => p.prep_date as string);
      const trades = dates.length ? await getAnalyticsTrades(c.db, { sample: false, from: dates[dates.length - 1], to: dates[0] }) : [];
      return out({
        preps: preps.map((p) => {
          const day = trades.filter((x) => x.trade_date === p.prep_date && (!p.instrument_id || x.instrument_id === p.instrument_id));
          return {
            date: p.prep_date, instrument: p.instrument_id ? c.labels.instruments.get(p.instrument_id) : "general", daily_bias: p.daily_bias, expected_direction: p.expected_direction,
            planned_session: p.planned_session, where_to: p.q_where_to, where_from: p.q_where_from, why: p.q_why, when: p.q_when, plan: p.trading_plan, setups: p.potential_setups,
            review: { what_happened: p.actual_outcome, bias_correct: p.bias_correct, target_reached: p.target_reached, setup_correct: p.setup_correct, followed_plan: p.followed_plan, improve: p.could_improve, lessons: p.lessons_today },
            trades_that_day: day.length, net_that_day: summarize(day).netPnl, directions: day.map((x) => x.direction),
          };
        }),
      });
    }
    case "get_mistakes": {
      const { f, unknown } = resolveFilters(a, c.ref);
      const trades = await getAnalyticsTrades(c.db, f);
      const tags = c.ref.tags.filter((g) => g.category === "mistake");
      const rows = mistakes(trades, tags.map((g) => g.id));
      return out({
        unknown_filters: unknown, closed_trades: trades.filter((x) => x.status === "closed").length,
        mistakes: rows.map((m) => ({ mistake: m.kind === "tag" ? `tag:${c.labels.tags.get(m.key)}` : m.key, count: m.count, share_of_trades: r2(m.share), net_pnl: m.netPnl, avg_r: m.avgR })),
      });
    }
    case "search_knowledge": {
      const qs = str(a.query);
      let q = c.db.from("knowledge_entries").select("id,title,kind,body,concept_key,pinned").order("pinned", { ascending: false }).limit(8);
      if (qs) { const s = qs.replace(/[%,()]/g, " "); q = q.or(`title.ilike.%${s}%,body.ilike.%${s}%`); }
      else q = q.or("kind.eq.rule,pinned.is.true");
      const { data, error } = await q;
      if (error) return out({ error: "Knowledge base unavailable." });
      return out({ entries: (data ?? []).map((e) => ({ title: e.title, kind: e.kind, concept: e.concept_key, text: String(e.body ?? "").slice(0, 2500) })) });
    }
    case "get_accounts": {
      const today = todayInZone(c.tz);
      const [trades, flows] = await Promise.all([getAnalyticsTrades(c.db, { sample: false }), getCashflows(c.db, { sample: false }).catch(() => [])]);
      return out({
        today,
        accounts: c.ref.accounts.filter((x) => !x.is_sample).map((x) => {
          const fin = accountFinance(Number(x.starting_balance), trades.filter((t) => t.account_id === x.id),
            flows.filter((t) => t.account_id === x.id).map((t) => ({ kind: t.kind, amount: Number(t.amount), occurred_on: t.occurred_on })), today,
            { account_size: x.account_size, profit_target: x.profit_target, daily_loss_limit: x.daily_loss_limit, max_drawdown: x.max_drawdown, drawdown_type: x.drawdown_type });
          return { name: x.name, type: x.account_type, status: x.status, prop_firm: x.prop_firm, active: x.is_active, ...fin };
        }),
      });
    }
    default:
      return out({ error: `Unknown tool ${name}` });
  }
}

export async function buildToolContext(db: SupabaseClient, tz: string, locale: "en" | "ka"): Promise<Ctx> {
  const ref = await getRefData(db);
  return {
    db, ref, tz, tradeIds: new Set(),
    labels: {
      t: getDict(locale),
      instruments: new Map(ref.instruments.map((i) => [i.id, i.symbol])),
      strategies: new Map(ref.strategies.map((s) => [s.id, s.name])),
      accounts: new Map(ref.accounts.map((a) => [a.id, a.name])),
      tags: new Map(ref.tags.map((g) => [g.id, g.name])),
    },
  };
}
