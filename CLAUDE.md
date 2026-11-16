@AGENTS.md

# TRADING HQ — developer guide

Private, single-user futures trading journal & analytics. Requirements: `TRADING_HQ_Development_Specification.txt`.
Design of record (architecture, full schema incl. later phases, calc rules, risks): `docs/ARCHITECTURE.md`.

## Stack
Next.js 16 (App Router, Turbopack, `src/proxy.ts` = middleware) · React 19 · TypeScript · Tailwind v4 ·
Supabase (Postgres + Auth + Storage) via `@supabase/ssr` · zod 4 · Recharts 3 · Vitest 5 + PGlite.

## Commands
- `npm run dev` — dev server on :3000 (shows /setup until `.env.local` exists)
- `npx vitest run` — unit tests + DB/RLS tests (PGlite runs the real migration; no Docker needed)
- `npx tsc --noEmit` (run `npx next typegen` first on a clean checkout) · `npx eslint .` · `npm run build`

## Architecture decisions (keep these)
1. **Executions are the source of truth.** `trades` rows cache engine-derived values (avg prices, gross/net,
   fees, R, duration). They are recomputed by `src/lib/calc/trade.ts` on every save in the server action.
   Never compute P/L anywhere else; never trust client-computed numbers (the form preview is display-only).
2. **Atomic saves** through the `save_trade(p_trade, p_executions, p_tag_ids)` Postgres function
   (SECURITY INVOKER → RLS applies). Adding a column to `trades` needs no change to the function.
3. **Fees counted once**: Σ execution fees + `adjustment_fees`. Net = gross − total fees.
4. **Time**: store UTC (`timestamptz`); UI reads/writes wall-clock in `profiles.trading_timezone`
   (default America/New_York) via `src/lib/time/zone.ts` (Intl, DST-safe). `trade_date` is the ET date.
5. **Security**: every table has `user_id` + RLS `user_id = auth.uid()`; `assert_same_owner()` trigger stops
   cross-user foreign keys; screenshots live in private bucket `trade-screenshots/{user_id}/{trade_id}/…`
   and are shown via 1-hour signed URLs. Only the publishable/anon key is used; no service key in Phase 1.
6. **Sample data** is `is_sample = true`, lives in account “SAMPLE — Backtest”, is excluded from all stats
   unless `?sample=1`, and is removable in Settings → Data.
7. **Cache Components disabled** (`next.config.ts`): all pages are private + dynamic. `createClient()` reads
   `cookies()` first so routes are never prerendered.
8. **Forms** submit manually (`ActionForm`, trade form) instead of `<form action>` so React 19 does not
   auto-reset user input when the server returns a validation error.
9. **Provenance**: `source` + `external_id` (unique per user+source) on trades/executions → idempotent imports later.
   TradingView alerts will get their own table and are never trades.

## Conventions
- Server actions live next to their route (`actions.ts`), validate with zod (`src/lib/validation/*`), return
  `ActionResult` (`{ ok, error, message }`), call `requireUser()` first, and `revalidatePath`.
- DB row types: `src/lib/db/types.ts` — keep in sync with migrations by hand.
- New schema changes = a new file `supabase/migrations/000N_*.sql`; add it to `tests/db/schema.test.ts`.
- Nullable booleans mean “not recorded” — never coerce to false in analytics. Forms post them as
  radio groups with values "", "yes", "no" (parsed by `triBool`).
- Polarity is never colour-only: charts use position (above/below zero), tables/badges use +/− signs, ▲/▼ and ✓/✕.

## Design system (UI redesign, branch `redesign/ui`)
- **Themes**: tokens on `:root` (light) and `[data-theme="dark"]` in `src/app/globals.css`, mapped to Tailwind via
  `@theme inline` → use `bg-bg`, `bg-surface`, `bg-surface-2/3`, `border-line(-strong)`, `text-fg/muted/faint`,
  `text-accent`, `bg-accent-soft`, `text-profit/loss/warn`, `bg-*-soft`, `shadow-card/pop`. Never hard-code hex in components.
- **No-flash**: `themeInitScript` (`src/lib/theme.ts`) runs inline in `<head>`; preference (`light|dark|system`) and
  sidebar state live in localStorage (`thq-theme`, `thq-sidebar`). `applyTheme()` dispatches `thq-theme-change`.
- **Charts** (`src/components/charts.tsx`) read colours from CSS variables via `usePalette()` and re-render on theme change.
- **Components**: `src/components/ui.tsx` (PageHeader, Card, Metric, StatRow, Badge, DirectionBadge, Empty, Notice,
  Field, Pnl), `toast.tsx` (ToastProvider/useToast, Tabs, Segmented), `action-form.tsx` (ActionForm with toast;
  SubmitButton with accessible `<dialog>` confirmation via `confirm`/`confirmLabel`), `filter-bar.tsx`
  (account + date presets + expandable filters, URL-driven), `trade-table.tsx` (client sort/search over server rows),
  `app-shell.tsx` (sidebar, top bar, user menu), `theme-switcher.tsx`. Route-level `loading.tsx`/`error.tsx` in `(app)`.
- Component CSS classes (`.field`, `.btn*`, `.card`, `.table`, `.label`, `.eyebrow`, `.skeleton`) live in `@layer components`.
- Icons: `lucide-react` (pinned 1.59.0). Fonts: Geist + Geist Mono (`.num` for all numbers).
- Unbuilt sections stay disabled in the sidebar with a phase badge — do not add fake pages.

## Branding
- Source of truth: `public/logo.svg` (official logo, CorelDRAW export, 2400×1600 canvas — never edit it).
- `node scripts/build-brand.mjs` regenerates `public/brand/logo-{dark,light}.svg` (full lock-up cropped to the
  artwork), `public/brand/mark{,-light}.svg` (candlestick symbol only) and the favicon `src/app/icon.svg`
  (symbol; recolours via `prefers-color-scheme`). Re-run it if the logo file changes.
- Use `<BrandLogo className="h-8" />` / `<BrandMark />` from `src/components/brand.tsx`; size by height only.
  Both theme variants render and CSS shows the right one (no flash). Sidebar 32px, mobile bar 20–24px, login 48–56px.

## Project structure
```
supabase/migrations/      SQL migrations (apply in Supabase SQL editor)
src/proxy.ts              session refresh + auth redirect
src/lib/calc/             trade engine, stats, money rounding (pure, tested)
src/lib/time/zone.ts      timezone + session classification
src/lib/data/             queries, filters, trade detail loader
src/lib/validation/       zod schemas
src/lib/sample/           deterministic sample-data generator
src/app/(app)/            authenticated app: / (dashboard), journal, prep, settings
src/app/api/export/[kind] trades | executions | backup downloads
tests/                    vitest (calc, time, db/RLS via PGlite)
```

## Implementation status
### Phase 1 — implemented and browser-verified against the live Supabase project (2026-11-16)
Migrations applied: 0001, 0002. Verified live: sign-up + email confirm, RLS (own rows only, cross-user
insert/reassign rejected, anon 401, storage folder isolation), trade create/edit/delete incl. partial exits,
server recalculation, screenshots upload/edit/delete, prep create/review/delete, dashboard + filters,
all three exports, sample data generate/remove. Not exercised in-browser: sign-out button, password reset (not built).
- Auth (email/password, confirm-link callback, sign-out), protected routes
- Settings: profile/timezones, accounts (+ prop-rule fields), instruments (editable specs & fees),
  strategies, tags, custom fields, data export, sample data, honest integrations status page
- Journal: list + filters + CSV export, create/edit/delete, multi-execution editor (scale in/out, partials),
  live calc preview, ICT context, psychology, tags, custom fields, notes; detail page
- Screenshots: multi-upload direct to Storage, phase + caption, edit, delete, signed-URL gallery
- Daily prep: per date (+ optional instrument), four questions, levels, plan, end-of-day review,
  plan-vs-actual panel with the day’s trades, bias-accuracy count on the list
- Dashboard: all spec §4 stats, equity/cumulative, drawdown, day/week/month/year, win vs loss; filters
- Exports: trades CSV (filtered), executions CSV, full JSON backup

### Known limitations / next
- `.env.local` URL must be the bare project URL (no `/rest/v1/`). New Supabase projects need 0002 (grants).
- Deleted screenshots may stay reachable via an already-issued signed URL until Supabase's CDN cache expires (≤1h).
- No password-reset flow yet (use Supabase dashboard). Tailwind component classes must stay in `@layer components`.
- Equity = balance (no live prices for open positions). Deposits/withdrawals arrive with Phase 2.
- No restore-from-backup yet; screenshots are not embedded in the JSON backup.
- Session windows are fixed defaults (`SESSION_WINDOWS_NY`); trade session/date are editable per trade.
- Changing an instrument's specs does not recompute existing trades until they are re-saved.
- Phase 2: analytics page, comparisons, psychology/mistake analysis, financial management (cash flows),
  knowledge base (tables designed in docs/ARCHITECTURE.md §3).
