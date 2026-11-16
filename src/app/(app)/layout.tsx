import { Sidebar } from "@/components/sidebar";
import { requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/data/queries";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { supabase, userId, email } = await requireUser();
  const profile = await getProfile(supabase, userId);
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar email={email} tradingTz={profile.trading_timezone} displayTz={profile.display_timezone} />
      <main className="min-w-0 flex-1 px-4 py-5 md:px-6 lg:px-8">{children}</main>
    </div>
  );
}
