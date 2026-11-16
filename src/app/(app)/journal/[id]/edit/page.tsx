import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getProfile, getRefData } from "@/lib/data/queries";
import { getTradeDetail } from "@/lib/data/trade-detail";
import { requireUser } from "@/lib/supabase/server";
import { localDateTimeInZone, todayInZone } from "@/lib/time/zone";
import { uuid } from "@/lib/validation/common";
import { TradeForm, type ExecDraft } from "../../trade-form";

export const metadata = { title: "Edit trade" };

export default async function EditTradePage({ params }: PageProps<"/journal/[id]/edit">) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const { supabase, userId } = await requireUser();
  const [profile, ref, detail] = await Promise.all([getProfile(supabase, userId), getRefData(supabase), getTradeDetail(supabase, id)]);
  if (!detail) notFound();
  const tz = profile.trading_timezone;
  const entrySide = detail.trade.direction === "long" ? "buy" : "sell";
  const execs: ExecDraft[] = detail.executions.map((e) => ({
    key: e.id,
    kind: e.side === entrySide ? "entry" : "exit",
    local: localDateTimeInZone(new Date(e.executed_at), tz),
    quantity: String(e.quantity),
    price: String(e.price),
    fees: String(e.fees),
    feeAuto: false,
  }));
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Edit trade" subtitle={`${detail.trade.trade_date}`} />
      <TradeForm
        {...ref}
        trade={detail.trade}
        initialExecutions={execs}
        initialTagIds={detail.tagIds}
        tradingTz={tz}
        defaultInstrumentId={profile.default_instrument_id}
        today={todayInZone(tz)}
        nowLocal={localDateTimeInZone(new Date(), tz)}
      />
    </div>
  );
}
