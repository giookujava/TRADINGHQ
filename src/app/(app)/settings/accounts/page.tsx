import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field } from "@/components/ui";
import { ACCOUNT_TYPES } from "@/lib/constants";
import type { Account } from "@/lib/db/types";
import { getRefData } from "@/lib/data/queries";
import { fmt, type Dict } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/supabase/server";
import { saveAccount } from "../actions";

export const metadata = { title: "Accounts" };

function AccountFields({ a, t }: { a?: Account; t: Dict }) {
  const S = t.set;
  return (
    <>
      {a ? <input type="hidden" name="id" value={a.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={S.name}><input name="name" className="field" defaultValue={a?.name} required maxLength={100} /></Field>
        <Field label={S.type}>
          <select name="account_type" className="field" defaultValue={a?.account_type ?? "backtest"}>
            {ACCOUNT_TYPES.map((x) => <option key={x} value={x}>{t.labels.accountTypes[x]}</option>)}
          </select>
        </Field>
        <Field label={S.startingBalance}>
          <input name="starting_balance" className="field num" inputMode="decimal" defaultValue={a?.starting_balance ?? 0} required />
        </Field>
        <Field label={S.currency}><input name="currency" className="field uppercase" defaultValue={a?.currency ?? "USD"} maxLength={3} /></Field>
        <Field label={S.broker}><input name="broker" className="field" defaultValue={a?.broker} placeholder={S.brokerPh} /></Field>
        <Field label={S.platform}><input name="platform" className="field" defaultValue={a?.platform} placeholder={S.platformPh} /></Field>
        <Field label={S.notes} className="sm:col-span-2"><input name="notes" className="field" defaultValue={a?.notes} maxLength={2000} /></Field>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted">{S.propRules}</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={S.propFirm}><input name="prop_firm" className="field" defaultValue={a?.prop_firm ?? ""} /></Field>
          <Field label={S.accountSize}><input name="account_size" className="field num" inputMode="decimal" defaultValue={a?.account_size ?? ""} /></Field>
          <Field label={S.profitTarget}><input name="profit_target" className="field num" inputMode="decimal" defaultValue={a?.profit_target ?? ""} /></Field>
          <Field label={S.dailyLoss}><input name="daily_loss_limit" className="field num" inputMode="decimal" defaultValue={a?.daily_loss_limit ?? ""} /></Field>
          <Field label={S.maxDd}><input name="max_drawdown" className="field num" inputMode="decimal" defaultValue={a?.max_drawdown ?? ""} /></Field>
          <Field label={t.finance.ddType}>
            <select name="drawdown_type" className="field" defaultValue={a?.drawdown_type ?? ""}>
              <option value="">—</option>{(["static", "trailing", "eod_trailing"] as const).map((k) => <option key={k} value={k}>{t.finance.ddTypes[k]}</option>)}
            </select>
          </Field>
          <Field label={t.finance.status}>
            <select name="status" className="field" defaultValue={a?.status ?? "active"}>
              {(["active", "passed", "failed", "funded", "closed"] as const).map((k) => <option key={k} value={k}>{t.finance.statuses[k]}</option>)}
            </select>
          </Field>
        </div>
      </details>
      <label className="mt-3 inline-flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" name="is_active" defaultChecked={a?.is_active ?? true} className="h-4 w-4 accent-[var(--accent)]" /> {S.activeForNew}
      </label>
    </>
  );
}

export default async function AccountsSettings() {
  const { supabase } = await requireUser();
  const [t, { accounts }] = await Promise.all([getT(), getRefData(supabase)]);
  const S = t.set;
  return (
    <div className="space-y-5">
      <Card title={S.newAccount}>
        <ActionForm action={saveAccount} resetOnSuccess>
          <AccountFields t={t} />
          <div className="mt-4"><SubmitButton className="btn-primary">{S.createAccount}</SubmitButton></div>
        </ActionForm>
      </Card>
      {accounts.length === 0 ? (
        <p className="text-sm text-muted">{S.noAccounts}</p>
      ) : (
        accounts.map((a) => (
          <Card
            key={a.id}
            title={<span className="flex flex-wrap items-center gap-2">{a.name} <Badge>{t.labels.accountTypes[a.account_type]}</Badge>{a.is_sample ? <Badge tone="warn">{t.common.sample}</Badge> : null}{!a.is_active ? <Badge>{S.inactive}</Badge> : null}</span>}
          >
            <ActionForm action={saveAccount}>
              <AccountFields a={a} t={t} />
              <div className="mt-4 flex gap-2">
                <SubmitButton className="btn-primary" name="intent" value="save">{t.common.save}</SubmitButton>
                <SubmitButton className="btn-danger" name="intent" value="delete" confirm={fmt(S.deleteAccount, { n: a.name })} confirmLabel={S.deleteAccountBtn}>{t.common.delete}</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        ))
      )}
    </div>
  );
}
