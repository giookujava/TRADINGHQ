import { PageHeader } from "@/components/ui";
import { getProfile, getRefData } from "@/lib/data/queries";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/supabase/server";
import { localDateTimeInZone, todayInZone } from "@/lib/time/zone";
import { TradeForm } from "../trade-form";

export const metadata = { title: "New trade" };

export default async function NewTradePage() {
  const { supabase, userId } = await requireUser();
  const [t, profile, ref] = await Promise.all([getT(), getProfile(supabase, userId), getRefData(supabase)]);
  const tz = profile.trading_timezone;
  const now = new Date();
  now.setSeconds(0, 0);
  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader eyebrow={t.journal.back} title={t.journal.newTitle} subtitle={t.journal.newSubtitle} />
      <TradeForm
        {...ref}
        tradingTz={tz}
        defaultInstrumentId={profile.default_instrument_id}
        today={todayInZone(tz)}
        nowLocal={localDateTimeInZone(now, tz)}
      />
    </div>
  );
}
