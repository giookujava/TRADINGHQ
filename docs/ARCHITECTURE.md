# TRADING HQ — Architecture & Implementation Plan

Source of requirements: `TRADING_HQ_Development_Specification.txt` (repo root).
This document is the design of record. `CLAUDE.md` tracks implementation status.

---

## 1. Technology stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | Server Components + Server Actions keep all DB writes and secrets server-side; one deployable unit; free hosting on Vercel. |
| Styling | **Tailwind CSS v4** | Per spec. Small design-token layer in `globals.css`, no component library. |
| DB / Auth / Storage | **Supabase** (Postgres + Auth + Storage) | Per spec. Free tier is enough for one user. RLS enforces privacy at the database. |
| Supabase client | `@supabase/ssr` + `@supabase/supabase-js` | Cookie-based sessions usable from Server Components, Server Actions and Route Handlers. |
| Validation | **zod** | One schema validates every Server Action input. |
| Charts | **Recharts** | Mature, SVG, small API; enough for equity/drawdown/bar charts. |
| Tests | **Vitest** + **PGlite** | Vitest for the calculation engine & timezone code; PGlite (real Postgres in WASM) to run the actual migration and prove RLS isolation without Docker. |
| AI (Phase 3) | Anthropic Claude API, server-side only | Called from a Route Handler with a tool-style retrieval layer; key never reaches the browser. |
| Hosting | Local dev first. Later: Vercel Hobby (free) + Supabase Free | **No deploy without your approval.** |

No ORM: the Supabase query builder + generated-style TypeScript types are sufficient for a single-user app and avoid a second migration system.

---

## 2. Application architecture

```
Browser (React, client components only where interaction needs it)
   │  forms → Server Actions        reads → Server Components
   ▼
Next.js server (Node runtime)
   ├─ src/lib/supabase/*      session-aware Supabase clients (anon key + user JWT)
   ├─ src/lib/calc/*          PURE calculation engine (P/L, fees, R, FIFO, stats, drawdown)
   ├─ src/lib/time/*          America/New_York ↔ UTC conversion, session classification
   ├─ src/lib/validation/*    zod schemas
   ├─ src/app/(app)/**        pages + server actions per section
   ├─ src/app/api/export/*    CSV / JSON export route handlers
   └─ (later) src/lib/integrations/{tradovate,tradingview,csv}/*  adapters
                (later) src/lib/ai/*  retrieval tools + Claude client
   ▼
Supabase
   ├─ Postgres  (every table has user_id + RLS `user_id = auth.uid()`)
   ├─ Auth      (email + password, single user; sign-ups disabled after you register)
   └─ Storage   private bucket `trade-screenshots`, path `{user_id}/{trade_id}/{file}`
```

### Key decisions

1. **Executions are the source of truth for a trade.** A trade is a container of fills
   (`trade_executions`: side, qty, price, time, fees). Entry/exit averages, quantity,
   gross/net P/L, fees, duration and R are *derived* by the TypeScript engine and
   cached on the `trades` row every time a trade is saved. This gives scaling in/out and
   partial exits for free and is exactly the shape Tradovate fills will arrive in (Phase 4).
2. **One calculation engine, server-side, unit-tested.** Dashboard, analytics, export and
   (later) the AI all read the same cached numbers or call the same functions. Money is
   rounded to cents only at the end of a calculation; prices are kept at full precision.
3. **Fees live in exactly one place per trade**: the sum of execution fees plus an explicit
   trade-level `adjustment_fees`. Net = Gross − total fees. Nothing else subtracts fees.
4. **Instrument specs are data, not code.** Each user gets editable instruments
   (tick size, tick value, point value, per-side commission, per-side exchange/NFA fees)
   seeded on sign-up. Commission defaults are **0** — you set your real rates; we do not guess.
5. **Time.** All timestamps are stored as `timestamptz` (UTC). The UI reads and writes
   times in the profile's trading timezone (default `America/New_York`); DST is handled by
   `Intl` (IANA tz database) — no manual offsets. Display can also show local (Tbilisi) time.
6. **Provenance on every trade/execution** (`source`: manual | csv | tradovate,
   `external_id`, unique per user+source). Imports can upsert idempotently → no duplicates.
   TradingView alerts will be a *separate table* and are never trades.
7. **Sample data is flagged** (`is_sample`) and lives only in a dedicated sample account.
   It is excluded from every statistic unless you explicitly toggle it on, and can be deleted in one click.
8. **Modularity.** The journal never imports integration or AI code. Those are optional
   modules that write into the same tables through server-side adapters.

---

## 3. Database schema (complete design)

Legend: **[P1]** created in Phase 1 migration · [P2]/[P3]/[P4] added by later migrations.
Every table: `id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users on delete cascade`,
`created_at`, `updated_at` (trigger), and RLS policies `select/insert/update/delete using (user_id = auth.uid())`.

### Core [P1]

**profiles** — 1:1 with `auth.users` (id = user id)
`display_name, trading_timezone (default 'America/New_York'), display_timezone (nullable, e.g. 'Asia/Tbilisi'), currency (default 'USD'), default_instrument_id`

**instruments**
`symbol, name, exchange, tick_size, tick_value, point_value, currency, commission_per_side, exchange_fee_per_side, is_active`
check: `tick_value = tick_size × point_value` (tolerance 1e-9) · unique `(user_id, symbol)`
Seeded per user: MNQ, NQ, MES, ES, M2K, RTY, MYM, YM, MGC, GC, MCL, CL.

**accounts**
`name, account_type (personal|demo|backtest|evaluation|funded), broker, platform, external_account_id, currency, starting_balance, is_active, is_sample, notes`
Prop-firm fields (nullable, UI in Phase 2): `prop_firm, account_size, profit_target, daily_loss_limit, max_drawdown, drawdown_type (static|trailing|eod_trailing), status (active|passed|failed|funded|closed)`

**strategies** — `name, description, is_active` · unique `(user_id, name)`

**tags** — `name, category (concept|mistake|condition|custom), color` · unique `(user_id, category, name)`
**trade_tags** — `(trade_id, tag_id)` pk, `user_id`

**custom_field_definitions** — `name, field_type (text|number|boolean|select), options jsonb, sort_order, is_active`
(values stored in `trades.custom_fields jsonb` keyed by definition id)

**trades**
- identity: `account_id, instrument_id, strategy_id?, trade_date (date, trading tz), direction (long|short), status (open|closed), session (asia|london|ny_am|ny_lunch|ny_pm|other), trade_type (backtest|demo|evaluation|funded|live)`
- plan: `stop_loss, take_profit, planned_risk_override, adjustment_fees`
- **derived (engine-maintained)**: `entry_time, exit_time, avg_entry_price, avg_exit_price, max_position, total_entry_qty, total_exit_qty, gross_pnl, total_fees, net_pnl, planned_risk, r_multiple, holding_seconds, points`
- ICT/market context (all nullable = "not recorded"): `daily_bias, htf_bias (bullish|bearish|neutral), market_structure, pdh, pdl, pwh, pwl, asia_high, asia_low, london_high, london_low, liquidity_sweep bool, buy_side_liquidity text, sell_side_liquidity text, displacement bool, mss bool, bos bool, fvg bool, order_block bool, premium_discount (premium|discount|equilibrium), smt_divergence bool, kill_zone text, entry_confirmation text, tf_alignment bool, analysis_notes`
- psychology: `emotion_before, emotion_during, emotion_after, confidence (1–10), was_planned, followed_rules, entered_early, exited_early, moved_stop, revenge_trade, overtraded (bools, nullable), mistakes, lessons, notes`
- `custom_fields jsonb`, provenance `source (manual|csv|tradovate), external_id, import_batch_id?`, `is_sample`
- unique `(user_id, source, external_id)` where external_id not null

**trade_executions**
`trade_id, executed_at timestamptz, side (buy|sell), quantity (>0 int), price (>0), fees (>=0), source, external_id` · unique `(user_id, source, external_id)`

**trade_screenshots**
`trade_id, storage_path, phase (before|during|after|other), caption, sort_order` — files in private Storage bucket.

**daily_preps**
`prep_date, instrument_id?, daily_bias, htf_analysis, liquidity_levels, expected_direction, liquidity_targets, pdh, pdl, pwh, pwl, asia_high, asia_low, london_high, london_low, economic_news, expected_volatility (low|normal|high), planned_session, potential_setups, observations, trading_plan,`
four questions `q_where_to, q_where_from, q_why, q_when,`
review `actual_outcome, bias_correct, target_reached, setup_correct, followed_plan, could_improve, lessons_today, reviewed_at, is_sample`
unique `(user_id, prep_date, coalesce(instrument_id, nil-uuid))`. Trades of the same date/instrument are shown alongside (join by date, no FK).

### Phase 2
**account_transactions** — `account_id, occurred_at, kind (deposit|withdrawal|payout|platform_fee|data_fee|other_expense|adjustment), amount, notes, source, external_id`.
Balance = starting_balance + Σ net trade P/L + Σ deposits − Σ withdrawals/payouts − Σ fees/expenses. Deposits/withdrawals are never part of trading P/L.
**prop_rule_snapshots** (optional) — daily high-water mark for trailing drawdown.

### Phase 3 (AI)
**knowledge_entries** — `title, kind (concept|strategy|entry_model|rule|lesson|note), body markdown, tags`; **knowledge_trade_links** `(entry_id, trade_id)`; **knowledge_attachments**.
(The Knowledge Base UI may be pulled into Phase 2 if you want it earlier.)
**ai_conversations**, **ai_messages** (role, content, tool calls, referenced trade ids), **ai_usage** (model, input/output tokens, cost estimate, day) + monthly cap in `profiles.ai_monthly_token_limit`.

### Phase 4 (integrations)
**integration_connections** — `provider (tradovate|lucid|tradingview), status, scopes, last_sync_at, last_error, metadata`; tokens stored encrypted / in Supabase Vault, never sent to the browser.
**sync_runs** — `connection_id, started_at, finished_at, status, inserted, updated, skipped, error`.
**import_batches** — CSV imports (file name, row counts, errors).
**tradingview_alerts** — `received_at, ticker, message, payload jsonb, linked_trade_id?` (an alert is **never** a trade).

---

## 4. Calculation rules (engine contract)

- `point_value` = $ per 1.00 index point per contract (MNQ 2, MES 5, NQ 20, ES 50).
- Direction = side of first execution. Running position may not cross zero (a flip must be two trades) — validated.
- Gross P/L (closed portion) via **FIFO** lot matching: Σ (exit − entry) × qty × point_value × (+1 long / −1 short).
  For a fully closed trade this equals the average-price result; FIFO matters only for open/partial trades and matches broker statements.
- Total fees = Σ execution fees + `adjustment_fees`. Net = Gross − Total fees.
- Default execution fee on manual entry = qty × (commission_per_side + exchange_fee_per_side) — prefilled, editable.
- Planned risk = override if set, else |avg entry − stop| × max position × point_value (requires a stop).
- R multiple = Net P/L ÷ planned risk (null if no risk).
- Holding duration = last exit − first entry (closed trades only).
- Status: closed when net position is 0.
- Stats: win = net > 0, loss = net < 0, breakeven = 0 (excluded from win rate denominator? **No** — win rate = wins / all closed trades; breakevens counted separately and shown).
- Profit factor = gross profit ÷ |gross loss| (of net P/L per trade); ∞ shown as "—" when no losses.
- Max drawdown = largest peak-to-trough fall of the cumulative net P/L curve (starting from the starting balance when one account is selected).
- Example test: 2 MNQ long, +20 points → $80 gross; fees $1.24/side/contract → $4.96 → $75.04 net.

---

## 5. Required configuration & external services

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` | Supabase project URL (public by design) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` | Public anon key — safe in browser because RLS protects data |
| `SUPABASE_SERVICE_ROLE_KEY` | server only, **not needed in Phase 1** | Phase 4 webhooks/sync jobs |
| `ANTHROPIC_API_KEY` | server only, Phase 3 | AI assistant |
| `TRADOVATE_*` | server only, Phase 4 | Only after verifying API access |

External services: **Supabase free project** (required for Phase 1). Everything else is later and optional.

---

## 6. Technical risks

1. **Tradovate API access** requires an API subscription/approval and OAuth app registration; prop-firm
   (Lucid) accounts may restrict API access. Must be verified before Phase 4 — CSV import is the fallback.
2. **Lucid Trading** likely has no public API; account rules may need to be tracked from Tradovate data + manual config.
3. **TradingView webhooks** require a paid TradingView plan and a public HTTPS endpoint (i.e. a deployment).
4. **Supabase free tier pauses** a project after ~7 days of inactivity, 500 MB DB / 1 GB storage limits. Fine for one trader; exports provide backups.
5. **Trading-day convention**: futures sessions start 18:00 ET the prior calendar day. Phase 1 lets you set the trade date explicitly (default = ET date of first entry).
6. **Floating point**: prices are multiplied in JS doubles and rounded to cents at the end — tested against known examples.
7. **AI accuracy**: AI must only see engine-computed numbers and retrieved records; design in Phase 3 enforces citations + sample sizes.

---

## 7. Phase 1 checklist

- [ ] Next.js + Tailwind + Supabase scaffolding, dark terminal theme, sidebar navigation
- [ ] SQL migration: tables, constraints, triggers, RLS, storage bucket + policies, per-user seeding
- [ ] RLS isolation test (PGlite) — user A cannot read/write user B's data
- [ ] Calculation engine + timezone utilities with unit tests (incl. spec MNQ example, partials, scaling, shorts, DST)
- [ ] Auth: sign up, sign in, sign out, protected routes
- [ ] Settings: profile/timezone, accounts, instruments (editable specs), strategies, tags, custom fields
- [ ] Trade journal: list with filters, create, edit, delete, multi-execution editor, ICT + psychology + notes, tags, custom fields
- [ ] Screenshots: upload (multiple), phase + caption, view, delete
- [ ] Daily preparation: create/edit per date, four questions, end-of-day review, linked trades of that day
- [ ] Dashboard: all stats from spec §4, equity / cumulative / drawdown / daily / weekly / monthly / yearly / win-loss charts, filters
- [ ] Export: trades CSV, executions CSV, full JSON backup
- [ ] Sample data: generate + remove, excluded by default
- [ ] Typecheck, lint, unit tests, production build, browser verification
- [ ] CLAUDE.md, `.env.example`, setup instructions
