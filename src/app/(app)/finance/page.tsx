import { ArrowDownToLine, ArrowUpFromLine, Landmark, Receipt, ShieldAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Empty, Field, Notice, PageHeader, StatCard, StatRow, cx } from "@/components/ui";
import { accountFinance, CASHFLOW_KINDS, signedAmount, type AccountFinance } from "@/lib/calc/finance";
import { roundMoney, sum } from "@/lib/calc/money";
import { getCashflows } from "@/lib/data/analytics";
import { getProfile, getRefData, getTrades } from "@/lib/data/queries";
import type { AccountTransaction } from "@/lib/db/types";
import { fmtMoney, fmtPct } from "@/lib/format";
import { fmt } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/supabase/server";
import { todayInZone } from "@/lib/time/zone";
import { deleteCashflow, saveCashflow } from "./actions";

export const metadata = { title: "Financial Management" };

function Bar({ value, tone = "accent" }: { value: number; tone?: "accent" | "loss" | "warn" }) {
  const cls = { accent: "bg-accent", loss: "bg-loss", warn: "bg-warn" }[tone];
  return <div className="h-2 overflow-hidden rounded-full bg-surface-3"><div className={cx("h-full rounded-full", cls)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></div>;
}

export default async function FinancePage({ searchParams }: PageProps<"/finance">) {
  const sp = await searchParams;
  const includeSample = sp.sample === "1";
  const { supabase, userId } = await requireUser();
  const [t, profile, ref, trades] = await Promise.all([getT(), getProfile(supabase, userId), getRefData(supabase), getTrades(supabase, { sample: includeSample })]);
  const F = t.finance;
  const cur = profile.currency;
  const today = todayInZone(profile.trading_timezone);

  let flows: AccountTransaction[] = [];
  let migrationMissing = false;
  try {
    flows = await getCashflows(supabase, { sample: includeSample });
  } catch {
    migrationMissing = true;
  }

  const accounts = ref.accounts.filter((a) => includeSample || !a.is_sample);
  const perAccount: { a: (typeof accounts)[number]; f: AccountFinance }[] = accounts.map((a) => ({
    a,
    f: accountFinance(
      Number(a.starting_balance),
      trades.filter((x) => x.account_id === a.id),
      flows.filter((x) => x.account_id === a.id).map((x) => ({ kind: x.kind, amount: Number(x.amount), occurred_on: x.occurred_on })),
      today,
      { account_size: a.account_size, profit_target: a.profit_target, daily_loss_limit: a.daily_loss_limit, max_drawdown: a.max_drawdown, drawdown_type: a.drawdown_type },
    ),
  }));
  const total = (k: keyof Pick<AccountFinance, "balance" | "tradingNet" | "deposits" | "withdrawals" | "feesExpenses" | "startingBalance">) =>
    roundMoney(sum(perAccount.map((x) => x.f[k])));
  const accName = new Map(accounts.map((a) => [a.id, a.name]));

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader title={F.title} subtitle={F.subtitle}
        actions={<Link href={includeSample ? "/finance" : "/finance?sample=1"} className="btn btn-ghost h-12 rounded-full">{includeSample ? t.prep.hideSample : t.prep.showSample}</Link>} />

      {migrationMissing ? <Notice tone="warn" className="mb-5">{F.migration}</Notice> : null}

      {accounts.length === 0 ? (
        <Empty icon={<Wallet className="h-5 w-5" />} title={F.emptyTitle} action={<Link href="/settings/accounts" className="btn btn-primary">{t.dashboard.createAccount}</Link>}>{F.emptyHint}</Empty>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            <StatCard highlight icon={<Landmark className="h-4 w-4" />} label={F.totalBalance} value={fmtMoney(total("balance"), cur)} hint={fmt(F.acrossAccounts, { n: accounts.length })} />
            <StatCard icon={<Wallet className="h-4 w-4" />} label={F.tradingPnl} value={fmtMoney(total("tradingNet"), cur, true)} tone={total("tradingNet") > 0 ? "profit" : total("tradingNet") < 0 ? "loss" : null} hint={F.tradingOnly} />
            <StatCard icon={<ArrowDownToLine className="h-4 w-4" />} label={F.deposits} value={fmtMoney(total("deposits"), cur)} hint={F.notPnl} />
            <StatCard icon={<ArrowUpFromLine className="h-4 w-4" />} label={F.withdrawals} value={fmtMoney(total("withdrawals"), cur)} hint={F.inclPayouts} />
            <StatCard icon={<Receipt className="h-4 w-4" />} label={F.fees} value={fmtMoney(total("feesExpenses"), cur)} hint={F.feesHint} />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            {perAccount.map(({ a, f }) => (
              <Card key={a.id}
                title={<span className="flex flex-wrap items-center gap-2">{a.name} <Badge>{t.labels.accountTypes[a.account_type]}</Badge>
                  {a.status !== "active" ? <Badge tone="accent">{(F.statuses as Record<string, string>)[a.status]}</Badge> : null}
                  {a.is_sample ? <Badge tone="warn">{t.common.sample}</Badge> : null}
                  {f.prop?.breached ? <Badge tone="loss"><ShieldAlert className="h-3 w-3" /> {F.breached}</Badge> : null}</span>}
                subtitle={[a.broker, a.prop_firm].filter(Boolean).join(" · ") || undefined}
                actions={<Link href="/settings/accounts" className="btn btn-sm btn-ghost text-accent">{F.editRules}</Link>}>
                <div className="grid gap-6 md:grid-cols-2">
                  <dl className="divide-y divide-line">
                    <StatRow label={F.starting} value={fmtMoney(f.startingBalance, cur)} />
                    <StatRow label={F.tradingPnl} value={fmtMoney(f.tradingNet, cur, true)} tone={f.tradingNet > 0 ? "profit" : f.tradingNet < 0 ? "loss" : null} />
                    <StatRow label={F.deposits} value={fmtMoney(f.deposits, cur)} />
                    <StatRow label={F.withdrawals} value={f.withdrawals ? `−${fmtMoney(f.withdrawals, cur)}` : fmtMoney(0, cur)} />
                    <StatRow label={F.fees} value={f.feesExpenses ? `−${fmtMoney(f.feesExpenses, cur)}` : fmtMoney(0, cur)} />
                    {f.adjustments ? <StatRow label={F.adjustments} value={fmtMoney(f.adjustments, cur, true)} /> : null}
                    <div className="flex items-baseline justify-between py-2.5"><dt className="font-bold">{F.balance}</dt><dd className="num text-lg font-bold">{fmtMoney(f.balance, cur)}</dd></div>
                  </dl>
                  {f.prop ? (
                    <div className="space-y-4 rounded-2xl border border-line bg-surface-2 p-4">
                      <div className="eyebrow">{F.propRules}</div>
                      {f.prop.targetProgress != null ? (
                        <div>
                          <div className="mb-1.5 flex justify-between text-sm"><span>{F.target}</span><span className="num font-semibold">{fmtPct(f.prop.targetProgress, 0)}</span></div>
                          <Bar value={f.prop.targetProgress} />
                          <div className="mt-1 text-xs text-muted">{fmt(F.targetLeft, { v: fmtMoney(f.prop.targetRemaining, cur), t: fmtMoney(a.profit_target, cur) })}</div>
                        </div>
                      ) : null}
                      {f.prop.dailyLossRemaining != null && a.daily_loss_limit ? (
                        <div>
                          <div className="mb-1.5 flex justify-between text-sm"><span>{F.dailyLoss}</span><span className="num font-semibold">{fmtMoney(f.prop.dailyLossUsed, cur)} / {fmtMoney(a.daily_loss_limit, cur)}</span></div>
                          <Bar value={(f.prop.dailyLossUsed ?? 0) / Number(a.daily_loss_limit)} tone={(f.prop.dailyLossUsed ?? 0) / Number(a.daily_loss_limit) > 0.7 ? "loss" : "warn"} />
                          <div className="mt-1 text-xs text-muted">{fmt(F.todayLeft, { v: fmtMoney(f.prop.dailyLossRemaining, cur), d: today })}</div>
                        </div>
                      ) : null}
                      {f.prop.drawdownRemaining != null && a.max_drawdown ? (
                        <div>
                          <div className="mb-1.5 flex justify-between text-sm"><span>{F.ddRemaining}</span><span className={cx("num font-semibold", f.prop.drawdownRemaining <= 0 && "text-loss")}>{fmtMoney(f.prop.drawdownRemaining, cur)}</span></div>
                          <Bar value={Math.max(0, f.prop.drawdownRemaining) / Number(a.max_drawdown)} tone={f.prop.drawdownRemaining / Number(a.max_drawdown) < 0.3 ? "loss" : "accent"} />
                          <div className="mt-1 text-xs text-muted">{fmt(F.ddFloor, { v: fmtMoney(f.prop.drawdownFloor, cur), k: (F.ddTypes as Record<string, string>)[a.drawdown_type ?? "static"] })}</div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex items-center rounded-2xl border border-dashed border-line-strong p-4 text-sm text-muted">{F.noRules}</div>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {!migrationMissing ? (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
              <Card title={F.addTitle} subtitle={F.addHint}>
                <ActionForm action={saveCashflow} resetOnSuccess className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={F.account}>
                      <select name="account_id" className="field" required>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                    </Field>
                    <Field label={F.date}><input type="date" name="occurred_on" className="field" defaultValue={today} required /></Field>
                    <Field label={F.kind}>
                      <select name="kind" className="field">{CASHFLOW_KINDS.map((k) => <option key={k} value={k}>{(F.kinds as Record<string, string>)[k]}</option>)}</select>
                    </Field>
                    <Field label={F.amount} hint={F.amountHint}><input name="amount" className="field num" inputMode="decimal" required /></Field>
                  </div>
                  <Field label={t.set.notes}><input name="notes" className="field" maxLength={500} /></Field>
                  <SubmitButton className="btn-primary">{F.addBtn}</SubmitButton>
                </ActionForm>
              </Card>
              <Card title={F.history} subtitle={fmt(F.historyHint, { n: flows.length })} flush>
                {flows.length ? (
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead><tr><th>{F.date}</th><th>{F.account}</th><th>{F.kind}</th><th className="text-right">{F.amount}</th><th>{t.set.notes}</th><th /></tr></thead>
                      <tbody>
                        {flows.map((x) => {
                          const signed = signedAmount(x.kind, Number(x.amount));
                          return (
                            <tr key={x.id}>
                              <td className="num">{x.occurred_on}</td>
                              <td className="text-muted">{accName.get(x.account_id) ?? "—"}</td>
                              <td>{(F.kinds as Record<string, string>)[x.kind]}</td>
                              <td className={cx("num text-right font-semibold", signed > 0 && "text-profit", signed < 0 && "text-loss")}>{fmtMoney(signed, cur, true)}</td>
                              <td className="max-w-56 truncate text-muted">{x.notes}</td>
                              <td className="text-right">
                                <ActionForm action={deleteCashflow}>
                                  <input type="hidden" name="id" value={x.id} />
                                  <SubmitButton className="btn-sm btn-ghost text-loss" confirm={F.deleteConfirm}>✕</SubmitButton>
                                </ActionForm>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="px-5 pb-5 text-sm text-faint">{F.noFlows}</p>}
              </Card>
            </div>
          ) : null}
          <p className="text-xs leading-relaxed text-faint">{F.footnote}</p>
        </div>
      )}
    </div>
  );
}
