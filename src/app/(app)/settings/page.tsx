import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field } from "@/components/ui";
import { getProfile, getRefData } from "@/lib/data/queries";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/supabase/server";
import { formatInZone, tzAbbreviation } from "@/lib/time/zone";
import { updateProfile } from "./actions";

export const metadata = { title: "Settings" };

const COMMON_TZ = ["America/New_York", "America/Chicago", "Europe/London", "Asia/Tbilisi", "Asia/Dubai", "UTC"];

export default async function ProfileSettings() {
  const { supabase, userId, email } = await requireUser();
  const [t, profile, ref] = await Promise.all([getT(), getProfile(supabase, userId), getRefData(supabase)]);
  const S = t.set;
  const now = new Date();
  const zones = Array.from(new Set([...COMMON_TZ, ...Intl.supportedValuesOf("timeZone")]));

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title={S.profileCard}>
        <ActionForm action={updateProfile} className="space-y-4">
          <Field label={S.email}><input className="field" value={email ?? ""} disabled readOnly /></Field>
          <Field label={S.displayName}>
            <input name="display_name" className="field" defaultValue={profile.display_name ?? ""} maxLength={100} />
          </Field>
          <Field label={S.tradingTz} hint={S.tradingTzHint}>
            <select name="trading_timezone" className="field" defaultValue={profile.trading_timezone}>
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </Field>
          <Field label={S.secondTz} hint={S.secondTzHint}>
            <select name="display_timezone" className="field" defaultValue={profile.display_timezone ?? ""}>
              <option value="">{t.common.none}</option>
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={S.currency}>
              <input name="currency" className="field uppercase" defaultValue={profile.currency} maxLength={3} />
            </Field>
            <Field label={S.defaultInstrument}>
              <select name="default_instrument_id" className="field" defaultValue={profile.default_instrument_id ?? ""}>
                <option value="">{t.common.none}</option>
                {ref.instruments.filter((i) => i.is_active).map((i) => <option key={i.id} value={i.id}>{i.symbol}</option>)}
              </select>
            </Field>
          </div>
          <SubmitButton className="btn-primary">{S.savePrefs}</SubmitButton>
        </ActionForm>
      </Card>
      <Card title={S.timeCheck}>
        <dl className="space-y-2 text-sm">
          {[profile.trading_timezone, profile.display_timezone].filter(Boolean).map((tz) => (
            <div key={tz} className="flex justify-between gap-3">
              <dt className="text-muted">{tz} ({tzAbbreviation(now, tz!)})</dt>
              <dd className="num">{formatInZone(now, tz!, { dateStyle: "medium", timeStyle: "short", hourCycle: "h23" })}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-faint">{S.timeNote}</p>
      </Card>
    </div>
  );
}
