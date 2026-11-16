import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Notice } from "@/components/ui";
import type { Instrument } from "@/lib/db/types";
import { getRefData } from "@/lib/data/queries";
import { requireUser } from "@/lib/supabase/server";
import { saveInstrument } from "../actions";

export const metadata = { title: "Instruments" };

const COLS = "grid grid-cols-2 items-end gap-2 sm:grid-cols-[80px_1fr_70px_90px_90px_90px_90px_auto]";

function Row({ i }: { i?: Instrument }) {
  return (
    <ActionForm action={saveInstrument} resetOnSuccess={!i} className="border-b border-line/60 py-2.5 last:border-0">
      {i ? <input type="hidden" name="id" value={i.id} /> : null}
      <div className={COLS}>
        <input name="symbol" className="field num uppercase" defaultValue={i?.symbol} placeholder="Symbol" required aria-label="Symbol" />
        <input name="name" className="field" defaultValue={i?.name} placeholder="Name" aria-label="Name" />
        <input name="exchange" className="field" defaultValue={i?.exchange} placeholder="Exch." aria-label="Exchange" />
        <input name="tick_size" className="field num" inputMode="decimal" defaultValue={i?.tick_size} placeholder="Tick size" required aria-label="Tick size" />
        <input name="point_value" className="field num" inputMode="decimal" defaultValue={i?.point_value} placeholder="$ / point" required aria-label="Point value" />
        <input name="commission_per_side" className="field num" inputMode="decimal" defaultValue={i?.commission_per_side ?? 0} required aria-label="Commission per side" />
        <input name="exchange_fee_per_side" className="field num" inputMode="decimal" defaultValue={i?.exchange_fee_per_side ?? 0} required aria-label="Exchange fee per side" />
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1 text-xs text-muted" title="Active">
            <input type="checkbox" name="is_active" defaultChecked={i?.is_active ?? true} /> On
          </label>
          {i ? (
            <>
              <SubmitButton className="btn-sm" name="intent" value="save">Save</SubmitButton>
              <SubmitButton className="btn-sm btn-danger" name="intent" value="delete" confirm={`Delete ${i.symbol}? Only possible if no trades use it.`}>✕</SubmitButton>
            </>
          ) : (
            <SubmitButton className="btn-sm btn-primary">Add</SubmitButton>
          )}
        </div>
      </div>
      {i ? (
        <div className="num mt-1 text-[11px] text-faint">
          tick value ${i.tick_value} · round-turn cost per contract ${((i.commission_per_side + i.exchange_fee_per_side) * 2).toFixed(2)}
        </div>
      ) : null}
    </ActionForm>
  );
}

export default async function InstrumentSettings() {
  const { supabase } = await requireUser();
  const { instruments } = await getRefData(supabase);
  return (
    <div className="space-y-4">
      <Notice tone="warn">
        Commission and exchange/NFA fees are pre-filled as <strong>0</strong> — enter your broker’s actual per-side rates
        so new executions get correct default fees. Point value = dollars per 1.00 index point per contract (MNQ = 2).
      </Notice>
      <Card title="Contract specifications">
        <div className={`${COLS} hidden pb-1 text-[11px] uppercase tracking-wide text-muted sm:grid`}>
          <span>Symbol</span><span>Name</span><span>Exch.</span><span>Tick size</span><span>$ / point</span>
          <span>Comm./side</span><span>Fees/side</span><span />
        </div>
        {instruments.map((i) => <Row key={i.id} i={i} />)}
        <div className="mt-3 border-t border-line pt-3">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">Add instrument</div>
          <Row />
        </div>
      </Card>
    </div>
  );
}
