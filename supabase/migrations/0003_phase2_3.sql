-- TRADING HQ — Phase 2 (financial management, knowledge base) + Phase 3 (AI assistant).
-- Apply in Supabase: SQL Editor → paste → Run. Safe on a database that already has 0001 + 0002.
-- Every new table carries user_id and is protected by RLS (user_id = auth.uid()).

-- ---------------------------------------------------------------------------
-- account cash flows (deposits / withdrawals / payouts / fees) — never trading P/L
-- ---------------------------------------------------------------------------
create table public.account_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  occurred_on date not null,
  kind text not null check (kind in ('deposit','withdrawal','payout','platform_fee','data_fee','other_expense','adjustment')),
  -- positive for every kind except 'adjustment', which may be signed
  amount numeric(14,2) not null check (amount <> 0 and (kind = 'adjustment' or amount > 0)),
  notes text not null default '',
  source text not null default 'manual' check (source in ('manual','csv','tradovate','lucid')),
  external_id text,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index account_transactions_account_idx on public.account_transactions (account_id, occurred_on);
create unique index account_transactions_source_external_uidx on public.account_transactions (user_id, source, external_id) where external_id is not null;

-- ---------------------------------------------------------------------------
-- strategy & knowledge base
-- ---------------------------------------------------------------------------
create table public.knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  kind text not null default 'concept' check (kind in ('concept','strategy','entry_model','rule','lesson','note','example')),
  body text not null default '',
  -- optional automatic trade matching: a built-in concept flag (e.g. 'fvg'), a strategy or a tag
  concept_key text check (concept_key in ('liquidity_sweep','displacement','mss','bos','fvg','order_block','smt_divergence','tf_alignment')),
  strategy_id uuid references public.strategies(id) on delete set null,
  tag_id uuid references public.tags(id) on delete set null,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index knowledge_entries_user_idx on public.knowledge_entries (user_id, kind, title);

create table public.knowledge_trade_links (
  entry_id uuid not null references public.knowledge_entries(id) on delete cascade,
  trade_id uuid not null references public.trades(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, trade_id)
);
create index knowledge_trade_links_trade_idx on public.knowledge_trade_links (trade_id);

-- ---------------------------------------------------------------------------
-- AI assistant: conversations, messages (with token usage for cost tracking)
-- ---------------------------------------------------------------------------
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  meta jsonb not null default '{}'::jsonb,          -- tools used, referenced trade ids, errors
  model text,
  input_tokens int not null default 0,
  cached_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(12,6) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);
create index ai_messages_usage_idx on public.ai_messages (user_id, created_at);

alter table public.profiles
  add column if not exists ai_enabled boolean not null default true,
  add column if not exists ai_model text not null default 'gpt-6.1-sol',
  add column if not exists ai_monthly_budget_usd numeric(10,2) not null default 5 check (ai_monthly_budget_usd >= 0);

-- ---------------------------------------------------------------------------
-- ownership guard: extend the Phase 1 function with the new tables
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
  elsif tg_table_name = 'account_transactions' then
    select exists(select 1 from accounts where id = new.account_id and user_id = new.user_id) into ok;
  elsif tg_table_name = 'knowledge_entries' then
    select (new.strategy_id is null or exists(select 1 from strategies where id = new.strategy_id and user_id = new.user_id))
       and (new.tag_id is null or exists(select 1 from tags where id = new.tag_id and user_id = new.user_id))
      into ok;
  elsif tg_table_name = 'knowledge_trade_links' then
    select exists(select 1 from knowledge_entries where id = new.entry_id and user_id = new.user_id)
       and exists(select 1 from trades where id = new.trade_id and user_id = new.user_id)
      into ok;
  elsif tg_table_name = 'ai_messages' then
    select exists(select 1 from ai_conversations where id = new.conversation_id and user_id = new.user_id) into ok;
  else
    ok := true;
  end if;
  if not ok then
    raise exception 'referenced record does not belong to this user' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- triggers, RLS, grants
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['account_transactions','knowledge_entries','ai_conversations','ai_messages']
  loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
  foreach t in array array['account_transactions','knowledge_entries','knowledge_trade_links','ai_messages']
  loop
    execute format('create trigger %I_same_owner before insert or update on public.%I for each row execute function public.assert_same_owner()', t, t);
  end loop;
  foreach t in array array['account_transactions','knowledge_entries','knowledge_trade_links','ai_conversations','ai_messages']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I_select on public.%I for select to authenticated using (user_id = auth.uid())', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (user_id = auth.uid())', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (user_id = auth.uid())', t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
