-- TRADING HQ — Phase 1 foundation schema
-- Apply in Supabase: SQL Editor → paste → Run  (or `supabase db push`).
-- Every user-owned table carries user_id and is protected by RLS (user_id = auth.uid()).

-- gen_random_uuid() is built into Postgres 13+ (no extension needed)

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  trading_timezone text not null default 'America/New_York',
  display_timezone text,
  currency text not null default 'USD',
  default_instrument_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- instruments (editable contract specifications)
-- ---------------------------------------------------------------------------
create table public.instruments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (length(symbol) between 1 and 20),
  name text not null default '',
  exchange text not null default '',
  tick_size numeric(18,8) not null check (tick_size > 0),
  tick_value numeric(18,8) not null check (tick_value > 0),
  point_value numeric(18,8) not null check (point_value > 0),
  currency text not null default 'USD',
  commission_per_side numeric(12,4) not null default 0 check (commission_per_side >= 0),
  exchange_fee_per_side numeric(12,4) not null default 0 check (exchange_fee_per_side >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, symbol),
  constraint instruments_tick_consistency check (abs(tick_value - tick_size * point_value) < 0.000001)
);

alter table public.profiles
  add constraint profiles_default_instrument_fk
  foreign key (default_instrument_id) references public.instruments(id) on delete set null;

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 100),
  account_type text not null check (account_type in ('personal','demo','backtest','evaluation','funded')),
  broker text not null default '',
  platform text not null default '',
  external_account_id text,
  currency text not null default 'USD',
  starting_balance numeric(14,2) not null default 0,
  is_active boolean not null default true,
  is_sample boolean not null default false,
  notes text not null default '',
  -- prop-firm fields (UI in Phase 2)
  prop_firm text,
  account_size numeric(14,2),
  profit_target numeric(14,2),
  daily_loss_limit numeric(14,2),
  max_drawdown numeric(14,2),
  drawdown_type text check (drawdown_type in ('static','trailing','eod_trailing')),
  status text not null default 'active' check (status in ('active','passed','failed','funded','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------------------------------------------------------------------------
-- strategies, tags, custom fields
-- ---------------------------------------------------------------------------
create table public.strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 100),
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  category text not null default 'custom' check (category in ('concept','mistake','condition','custom')),
  color text not null default '#64748b',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category, name)
);

create table public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  field_type text not null check (field_type in ('text','number','boolean','select')),
  options jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------------------------------------------------------------------------
-- trades
-- ---------------------------------------------------------------------------
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  instrument_id uuid not null references public.instruments(id) on delete restrict,
  strategy_id uuid references public.strategies(id) on delete set null,
  trade_date date not null,
  direction text not null check (direction in ('long','short')),
  status text not null default 'closed' check (status in ('open','closed')),
  session text check (session in ('asia','london','ny_am','ny_lunch','ny_pm','other')),
  trade_type text not null check (trade_type in ('backtest','demo','evaluation','funded','live')),

  stop_loss numeric(18,8),
  take_profit numeric(18,8),
  planned_risk_override numeric(14,2) check (planned_risk_override is null or planned_risk_override > 0),
  adjustment_fees numeric(12,2) not null default 0 check (adjustment_fees >= 0),

  -- derived by the calculation engine (src/lib/calc) on every save
  entry_time timestamptz,
  exit_time timestamptz,
  avg_entry_price numeric(18,8),
  avg_exit_price numeric(18,8),
  max_position int,
  total_entry_qty int,
  total_exit_qty int,
  points numeric(18,8),
  gross_pnl numeric(14,2),
  total_fees numeric(14,2),
  net_pnl numeric(14,2),
  planned_risk numeric(14,2),
  r_multiple numeric(10,4),
  holding_seconds int,

  -- market context (null = not recorded)
  daily_bias text check (daily_bias in ('bullish','bearish','neutral')),
  htf_bias text check (htf_bias in ('bullish','bearish','neutral')),
  market_structure text,
  pdh numeric(18,8), pdl numeric(18,8), pwh numeric(18,8), pwl numeric(18,8),
  asia_high numeric(18,8), asia_low numeric(18,8),
  london_high numeric(18,8), london_low numeric(18,8),
  liquidity_sweep boolean,
  buy_side_liquidity text,
  sell_side_liquidity text,
  displacement boolean,
  mss boolean,
  bos boolean,
  fvg boolean,
  order_block boolean,
  premium_discount text check (premium_discount in ('premium','discount','equilibrium')),
  smt_divergence boolean,
  kill_zone text,
  entry_confirmation text,
  tf_alignment boolean,
  analysis_notes text,

  -- psychology & execution
  emotion_before text,
  emotion_during text,
  emotion_after text,
  confidence smallint check (confidence between 1 and 10),
  was_planned boolean,
  followed_rules boolean,
  entered_early boolean,
  exited_early boolean,
  moved_stop boolean,
  revenge_trade boolean,
  overtraded boolean,
  mistakes text,
  lessons text,
  notes text,

  custom_fields jsonb not null default '{}'::jsonb,

  source text not null default 'manual' check (source in ('manual','csv','tradovate')),
  external_id text,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index trades_source_external_uidx on public.trades (user_id, source, external_id) where external_id is not null;
create index trades_user_date_idx on public.trades (user_id, trade_date desc);
create index trades_account_idx on public.trades (account_id);
create index trades_instrument_idx on public.trades (instrument_id);
create index trades_strategy_idx on public.trades (strategy_id);

create table public.trade_executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references public.trades(id) on delete cascade,
  executed_at timestamptz not null,
  side text not null check (side in ('buy','sell')),
  quantity int not null check (quantity > 0),
  price numeric(18,8) not null check (price > 0),
  fees numeric(12,2) not null default 0 check (fees >= 0),
  source text not null default 'manual' check (source in ('manual','csv','tradovate')),
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index executions_source_external_uidx on public.trade_executions (user_id, source, external_id) where external_id is not null;
create index executions_trade_idx on public.trade_executions (trade_id, executed_at);

create table public.trade_tags (
  trade_id uuid not null references public.trades(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (trade_id, tag_id)
);
create index trade_tags_tag_idx on public.trade_tags (tag_id);

create table public.trade_screenshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references public.trades(id) on delete cascade,
  storage_path text not null unique,
  phase text not null default 'other' check (phase in ('before','during','after','other')),
  caption text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index screenshots_trade_idx on public.trade_screenshots (trade_id);

-- ---------------------------------------------------------------------------
-- daily preparation
-- ---------------------------------------------------------------------------
create table public.daily_preps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prep_date date not null,
  instrument_id uuid references public.instruments(id) on delete set null,
  daily_bias text check (daily_bias in ('bullish','bearish','neutral')),
  htf_analysis text,
  liquidity_levels text,
  expected_direction text check (expected_direction in ('up','down','range','unclear')),
  liquidity_targets text,
  pdh numeric(18,8), pdl numeric(18,8), pwh numeric(18,8), pwl numeric(18,8),
  asia_high numeric(18,8), asia_low numeric(18,8),
  london_high numeric(18,8), london_low numeric(18,8),
  economic_news text,
  expected_volatility text check (expected_volatility in ('low','normal','high')),
  planned_session text check (planned_session in ('asia','london','ny_am','ny_lunch','ny_pm','other')),
  potential_setups text,
  observations text,
  trading_plan text,
  q_where_to text,
  q_where_from text,
  q_why text,
  q_when text,
  actual_outcome text,
  bias_correct boolean,
  target_reached boolean,
  setup_correct boolean,
  followed_plan boolean,
  could_improve text,
  lessons_today text,
  reviewed_at timestamptz,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index daily_preps_unique_day on public.daily_preps
  (user_id, prep_date, coalesce(instrument_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------------------------------------------------------------------------
-- cross-row ownership guards: a row may only reference parents owned by the same user
-- (RLS hides other users' rows from SELECT, but FK checks bypass RLS, so we check explicitly)
-- ---------------------------------------------------------------------------
create or replace function public.assert_same_owner()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ok boolean;
begin
  if tg_table_name = 'trades' then
    select exists(select 1 from accounts where id = new.account_id and user_id = new.user_id)
       and exists(select 1 from instruments where id = new.instrument_id and user_id = new.user_id)
       and (new.strategy_id is null or exists(select 1 from strategies where id = new.strategy_id and user_id = new.user_id))
      into ok;
  elsif tg_table_name in ('trade_executions','trade_screenshots') then
    select exists(select 1 from trades where id = new.trade_id and user_id = new.user_id) into ok;
  elsif tg_table_name = 'trade_tags' then
    select exists(select 1 from trades where id = new.trade_id and user_id = new.user_id)
       and exists(select 1 from tags where id = new.tag_id and user_id = new.user_id)
      into ok;
  elsif tg_table_name = 'daily_preps' then
    select new.instrument_id is null
        or exists(select 1 from instruments where id = new.instrument_id and user_id = new.user_id)
      into ok;
  elsif tg_table_name = 'profiles' then
    select new.default_instrument_id is null
        or exists(select 1 from instruments where id = new.default_instrument_id and user_id = new.id)
      into ok;
  else
    ok := true;
  end if;
  if not ok then
    raise exception 'referenced record does not belong to this user' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','instruments','accounts','strategies','tags','custom_field_definitions',
                           'trades','trade_executions','trade_screenshots','daily_preps']
  loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
  foreach t in array array['trades','trade_executions','trade_screenshots','trade_tags','daily_preps','profiles']
  loop
    execute format('create trigger %I_same_owner before insert or update on public.%I for each row execute function public.assert_same_owner()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['instruments','accounts','strategies','tags','custom_field_definitions',
                           'trades','trade_executions','trade_tags','trade_screenshots','daily_preps']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I_select on public.%I for select to authenticated using (user_id = auth.uid())', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (user_id = auth.uid())', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (user_id = auth.uid())', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- per-user seed on sign-up: profile + standard CME instruments
-- Commissions default to 0: set YOUR broker's rates in Settings → Instruments.
-- ---------------------------------------------------------------------------
create or replace function public.seed_user_defaults(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id) values (p_user) on conflict (id) do nothing;
  insert into instruments (user_id, symbol, name, exchange, tick_size, tick_value, point_value) values
    (p_user, 'MNQ', 'Micro E-mini Nasdaq-100', 'CME',   0.25,  0.50,    2),
    (p_user, 'NQ',  'E-mini Nasdaq-100',       'CME',   0.25,  5.00,   20),
    (p_user, 'MES', 'Micro E-mini S&P 500',    'CME',   0.25,  1.25,    5),
    (p_user, 'ES',  'E-mini S&P 500',          'CME',   0.25, 12.50,   50),
    (p_user, 'M2K', 'Micro E-mini Russell 2000','CME',  0.10,  0.50,    5),
    (p_user, 'RTY', 'E-mini Russell 2000',     'CME',   0.10,  5.00,   50),
    (p_user, 'MYM', 'Micro E-mini Dow',        'CBOT',  1.00,  0.50,  0.5),
    (p_user, 'YM',  'E-mini Dow',              'CBOT',  1.00,  5.00,    5),
    (p_user, 'MGC', 'Micro Gold',              'COMEX', 0.10,  1.00,   10),
    (p_user, 'GC',  'Gold',                    'COMEX', 0.10, 10.00,  100),
    (p_user, 'MCL', 'Micro WTI Crude Oil',     'NYMEX', 0.01,  1.00,  100),
    (p_user, 'CL',  'WTI Crude Oil',           'NYMEX', 0.01, 10.00, 1000)
  on conflict (user_id, symbol) do nothing;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_user_defaults(new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.seed_user_defaults(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- storage: private screenshot bucket, objects namespaced by user id
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trade-screenshots', 'trade-screenshots', false, 10485760,
        array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do nothing;

create policy screenshots_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'trade-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
create policy screenshots_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'trade-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
create policy screenshots_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'trade-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
create policy screenshots_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'trade-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- save_trade: atomic upsert of a trade + its executions + its tags.
-- SECURITY INVOKER → RLS and ownership triggers apply to every statement.
-- The caller (server action) sends the full trade row including engine-derived fields.
-- ---------------------------------------------------------------------------
create or replace function public.save_trade(p_trade jsonb, p_executions jsonb, p_tag_ids uuid[])
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_set text;
  v_row jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if jsonb_typeof(p_executions) <> 'array' or jsonb_array_length(p_executions) = 0 then
    raise exception 'a trade needs at least one execution' using errcode = '22023';
  end if;

  v_row := jsonb_build_object(
      'id', gen_random_uuid(), 'created_at', now(), 'status', 'closed', 'adjustment_fees', 0,
      'custom_fields', '{}'::jsonb, 'source', 'manual', 'is_sample', false)
    || (p_trade - 'user_id' - 'created_at' - 'updated_at')
    || jsonb_build_object('user_id', v_uid, 'updated_at', now());
  v_id := (v_row->>'id')::uuid;

  select string_agg(format('%I = excluded.%I', attname, attname), ', ')
    into v_set
    from pg_attribute
   where attrelid = 'public.trades'::regclass and attnum > 0 and not attisdropped
     and attname not in ('id','user_id','created_at');

  execute format(
    'insert into public.trades select * from jsonb_populate_record(null::public.trades, $1)
     on conflict (id) do update set %s', v_set)
  using v_row;

  delete from public.trade_executions where trade_id = v_id;
  insert into public.trade_executions
    select * from jsonb_populate_recordset(null::public.trade_executions, (
      select jsonb_agg(
        jsonb_build_object('id', gen_random_uuid(), 'fees', 0, 'source', 'manual',
                           'created_at', now(), 'updated_at', now())
        || (e - 'id' - 'user_id' - 'trade_id')
        || jsonb_build_object('user_id', v_uid, 'trade_id', v_id))
      from jsonb_array_elements(p_executions) e));

  delete from public.trade_tags where trade_id = v_id;
  if p_tag_ids is not null and array_length(p_tag_ids, 1) > 0 then
    insert into public.trade_tags (trade_id, tag_id, user_id)
      select v_id, t, v_uid from unnest(p_tag_ids) t
      on conflict do nothing;
  end if;

  return v_id;
end $$;

revoke execute on function public.save_trade(jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.save_trade(jsonb, jsonb, uuid[]) to authenticated;
