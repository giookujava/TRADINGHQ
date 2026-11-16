-- TRADING HQ — explicit Data API privileges.
-- Newer Supabase projects no longer grant table access to the API roles automatically.
-- Row Level Security (migration 0001) still restricts every row to its owner; these grants
-- only allow the signed-in role to reach the tables at all. The anon role gets nothing.
-- Safe to run more than once.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on
  public.profiles, public.instruments, public.accounts, public.strategies, public.tags,
  public.custom_field_definitions, public.trades, public.trade_executions, public.trade_tags,
  public.trade_screenshots, public.daily_preps
to authenticated;

revoke all on
  public.profiles, public.instruments, public.accounts, public.strategies, public.tags,
  public.custom_field_definitions, public.trades, public.trade_executions, public.trade_tags,
  public.trade_screenshots, public.daily_preps
from anon;

grant execute on function public.save_trade(jsonb, jsonb, uuid[]) to authenticated;

-- Make the REST API pick up the schema immediately.
notify pgrst, 'reload schema';
