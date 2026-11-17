import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Notice } from "@/components/ui";
import type { Instrument } from "@/lib/db/types";
import { getRefData } from "@/lib/data/queries";
import { fmt, type Dict } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/supabase/server";
import { saveInstrument } from "../actions";

export const metadata = { title: "Instruments" };

const COLS = "grid grid-cols-2 items-end gap-2 sm:grid-cols-[84px_1fr_76px_92px_92px_92px_92px_auto]";

function Row({ i, t }: { i?: Instrument; t: Dict }) {
  const S = t.set;
  return (
    <ActionForm action={saveInstrument} resetOnSuccess={!i} className="border-b border-line py-3 last:border-0">
      {i ? <input type="hidden" name="id" value={i.id} /> : null}
      <div className={COLS}>
        <input name="symbol" className="field num uppercase" defaultValue={i?.symbol} placeholder={S.symbol} required aria-label={S.symbol} />
        <input name="name" className="field" defaultValue={i?.name} placeholder={S.name} aria-label={S.name} />
        <input name="exchange" className="field" defaultValue={i?.exchange} placeholder={S.exch} aria-label={S.exch} />
        <input name="tick_size" className="field num" inputMode="decimal" defaultValue={i?.tick_size} placeholder={S.tickSize} required aria-label={S.tickSize} />
        <input name="point_value" className="field num" inputMode="decimal" defaultValue={i?.point_value} placeholder={S.perPoint} required aria-label={S.perPoint} />
        <input name="commission_per_side" className="field num" inputMode="decimal" defaultValue={i?.commission_per_side ?? 0} required aria-label={S.commSide} />
        <input name="exchange_fee_per_side" className="field num" inputMode="decimal" defaultValue={i?.exchange_fee_per_side ?? 0} required aria-label={S.feesSide} />
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1 text-xs text-muted" title={t.common.active}>
            <input type="checkbox" name="is_active" defaultChecked={i?.is_active ?? true} className="h-4 w-4 accent-[var(--accent)]" /> {S.on}
          </label>
          {i ? (
            <>
              <SubmitButton className="btn-sm" name="intent" value="save">{t.common.save}</SubmitButton>
              <SubmitButton className="btn-sm btn-danger" name="intent" value="delete" confirm={fmt(S.deleteInstrument, { s: i.symbol })} confirmLabel={S.deleteInstrumentBtn}>{t.common.delete}</SubmitButton>
            </>
          ) : (
            <SubmitButton className="btn-sm btn-primary">{t.common.add}</SubmitButton>
          )}
        </div>
      </div>
      {i ? (
        <div className="num mt-1 text-[11px] text-faint">
          {fmt(S.tickInfo, { v: i.tick_value, c: ((i.commission_per_side + i.exchange_fee_per_side) * 2).toFixed(2) })}
        </div>
      ) : null}
    </ActionForm>
  );
}

export default async function InstrumentSettings() {
  const { supabase } = await requireUser();
  const [t, { instruments }] = await Promise.all([getT(), getRefData(supabase)]);
  const S = t.set;
  return (
    <div className="space-y-4">
      <Notice tone="warn">{S.feesNotice}</Notice>
      <Card title={S.contractSpecs}>
        <div className={`${COLS} hidden pb-1 text-[11px] font-semibold uppercase tracking-wide text-faint sm:grid`}>
          <span>{S.symbol}</span><span>{S.name}</span><span>{S.exch}</span><span>{S.tickSize}</span><span>{S.perPoint}</span>
          <span>{S.commSide}</span><span>{S.feesSide}</span><span />
        </div>
        {instruments.map((i) => <Row key={i.id} i={i} t={t} />)}
        <div className="mt-3 border-t border-line pt-3">
          <div className="eyebrow mb-1">{S.addInstrument}</div>
          <Row t={t} />
        </div>
      </Card>
    </div>
  );
}
