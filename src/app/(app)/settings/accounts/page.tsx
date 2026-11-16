import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field } from "@/components/ui";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from "@/lib/constants";
import type { Account } from "@/lib/db/types";
import { getRefData } from "@/lib/data/queries";
import { requireUser } from "@/lib/supabase/server";
import { saveAccount } from "../actions";

export const metadata = { title: "Accounts" };

function AccountFields({ a }: { a?: Account }) {
  return (
    <>
      {a ? <input type="hidden" name="id" value={a.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Name"><input name="name" className="field" defaultValue={a?.name} required maxLength={100} /></Field>
        <Field label="Type">
          <select name="account_type" className="field" defaultValue={a?.account_type ?? "backtest"}>
            {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>)}
          </select>
        </Field>
        <Field label="Starting balance">
          <input name="starting_balance" className="field num" inputMode="decimal" defaultValue={a?.starting_balance ?? 0} required />
        </Field>
        <Field label="Currency"><input name="currency" className="field uppercase" defaultValue={a?.currency ?? "USD"} maxLength={3} /></Field>
        <Field label="Broker / prop firm"><input name="broker" className="field" defaultValue={a?.broker} placeholder="e.g. Lucid Trading" /></Field>
        <Field label="Platform"><input name="platform" className="field" defaultValue={a?.platform} placeholder="e.g. Tradovate, TradingView replay" /></Field>
        <Field label="Notes" className="sm:col-span-2"><input name="notes" className="field" defaultValue={a?.notes} maxLength={2000} /></Field>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted">Prop-firm rules (optional — used by Financial Management in Phase 2)</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Prop firm"><input name="prop_firm" className="field" defaultValue={a?.prop_firm ?? ""} /></Field>
          <Field label="Account size"><input name="account_size" className="field num" inputMode="decimal" defaultValue={a?.account_size ?? ""} /></Field>
          <Field label="Profit target"><input name="profit_target" className="field num" inputMode="decimal" defaultValue={a?.profit_target ?? ""} /></Field>
          <Field label="Daily loss limit"><input name="daily_loss_limit" className="field num" inputMode="decimal" defaultValue={a?.daily_loss_limit ?? ""} /></Field>
          <Field label="Max drawdown"><input name="max_drawdown" className="field num" inputMode="decimal" defaultValue={a?.max_drawdown ?? ""} /></Field>
        </div>
      </details>
      <label className="mt-3 inline-flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" name="is_active" defaultChecked={a?.is_active ?? true} /> Active (available for new trades)
      </label>
    </>
  );
}

export default async function AccountsSettings() {
  const { supabase } = await requireUser();
  const { accounts } = await getRefData(supabase);
  return (
    <div className="space-y-5">
      <Card title="New account">
        <ActionForm action={saveAccount} resetOnSuccess>
          <AccountFields />
          <div className="mt-3"><SubmitButton className="btn-primary">Create account</SubmitButton></div>
        </ActionForm>
      </Card>
      {accounts.length === 0 ? (
        <p className="text-sm text-muted">No accounts yet. Create one above — every trade belongs to an account (e.g. “Backtesting”).</p>
      ) : (
        accounts.map((a) => (
          <Card
            key={a.id}
            title={<span className="flex items-center gap-2 normal-case tracking-normal">{a.name} <Badge>{ACCOUNT_TYPE_LABELS[a.account_type]}</Badge>{a.is_sample ? <Badge tone="warn">Sample</Badge> : null}{!a.is_active ? <Badge>Inactive</Badge> : null}</span>}
          >
            <ActionForm action={saveAccount}>
              <AccountFields a={a} />
              <div className="mt-3 flex gap-2">
                <SubmitButton className="btn-primary" name="intent" value="save">Save</SubmitButton>
                <SubmitButton className="btn-danger" name="intent" value="delete" confirm={`Delete account “${a.name}”? Only possible when it has no trades.`}>Delete</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        ))
      )}
    </div>
  );
}
