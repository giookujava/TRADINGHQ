import { AppShell } from "@/components/app-shell";
import { getProfile, getRefData } from "@/lib/data/queries";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { supabase, userId, email } = await requireUser();
  const [profile, ref, total] = await Promise.all([
    getProfile(supabase, userId),
    getRefData(supabase),
    supabase.from("trades").select("id", { count: "exact", head: true }).eq("is_sample", false),
  ]);
  // Real (non-sample) active accounts with their trade counts, for the sidebar list.
  const accounts = ref.accounts.filter((a) => !a.is_sample && a.is_active);
  const counts = await Promise.all(
    accounts.map((a) => supabase.from("trades").select("id", { count: "exact", head: true }).eq("account_id", a.id)),
  );
  return (
    <AppShell
      email={email}
      displayName={profile.display_name}
      tradingTz={profile.trading_timezone}
      displayTz={profile.display_timezone}
      tradeCount={total.count ?? 0}
      accounts={accounts.map((a, i) => ({ id: a.id, name: a.name, count: counts[i].count ?? 0 }))}
    >
      {children}
    </AppShell>
  );
}
