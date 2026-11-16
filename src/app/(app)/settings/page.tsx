import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field } from "@/components/ui";
import { getProfile, getRefData } from "@/lib/data/queries";
import { requireUser } from "@/lib/supabase/server";
import { formatInZone, tzAbbreviation } from "@/lib/time/zone";
import { updateProfile } from "./actions";

export const metadata = { title: "Settings" };

const COMMON_TZ = ["America/New_York", "America/Chicago", "Europe/London", "Asia/Tbilisi", "Asia/Dubai", "UTC"];

export default async function ProfileSettings() {
  const { supabase, userId, email } = await requireUser();
  const [profile, ref] = await Promise.all([getProfile(supabase, userId), getRefData(supabase)]);
  const now = new Date();
  const zones = Array.from(new Set([...COMMON_TZ, ...Intl.supportedValuesOf("timeZone")]));

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Profile & preferences">
        <ActionForm action={updateProfile} className="space-y-3">
          <Field label="Email"><input className="field" value={email ?? ""} disabled readOnly /></Field>
          <Field label="Display name">
            <input name="display_name" className="field" defaultValue={profile.display_name ?? ""} maxLength={100} />
          </Field>
          <Field
            label="Trading timezone"
            hint="All trade times are entered and shown in this zone. Daylight saving is applied automatically."
          >
            <select name="trading_timezone" className="field" defaultValue={profile.trading_timezone}>
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </Field>
          <Field label="Secondary clock (optional)" hint="e.g. Asia/Tbilisi — shown in the sidebar and next to trade times.">
            <select name="display_timezone" className="field" defaultValue={profile.display_timezone ?? ""}>
              <option value="">None</option>
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Default currency">
              <input name="currency" className="field uppercase" defaultValue={profile.currency} maxLength={3} />
            </Field>
            <Field label="Default instrument">
              <select name="default_instrument_id" className="field" defaultValue={profile.default_instrument_id ?? ""}>
                <option value="">None</option>
                {ref.instruments.filter((i) => i.is_active).map((i) => <option key={i.id} value={i.id}>{i.symbol}</option>)}
              </select>
            </Field>
          </div>
          <SubmitButton className="btn-primary">Save preferences</SubmitButton>
        </ActionForm>
      </Card>
      <Card title="Time check">
        <dl className="space-y-2 text-sm">
          {[profile.trading_timezone, profile.display_timezone].filter(Boolean).map((tz) => (
            <div key={tz} className="flex justify-between">
              <dt className="text-muted">{tz} ({tzAbbreviation(now, tz!)})</dt>
              <dd className="num">{formatInZone(now, tz!, { dateStyle: "medium", timeStyle: "short", hourCycle: "h23" })}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-faint">
          Timestamps are stored in UTC and converted with the IANA timezone database, so New York ↔ Tbilisi
          differences (8 or 9 hours depending on US daylight saving) are handled for you.
        </p>
      </Card>
    </div>
  );
}
