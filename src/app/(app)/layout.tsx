import { AppShell } from "@/components/app-shell";
import { getProfile } from "@/lib/data/queries";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { supabase, userId, email } = await requireUser();
  const profile = await getProfile(supabase, userId);
  return (
    <AppShell email={email} displayName={profile.display_name} tradingTz={profile.trading_timezone} displayTz={profile.display_timezone}>
      {children}
    </AppShell>
  );
}
