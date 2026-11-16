import { Badge, Card } from "@/components/ui";

export const metadata = { title: "Integrations" };

const PROVIDERS = [
  {
    name: "Tradovate",
    what: "Import executed fills, prices, timestamps, quantities, commissions and account balances.",
    prerequisites: "Requires Tradovate API access (API subscription + registered OAuth app) and confirmation that your prop-firm account permits read-only API access.",
  },
  {
    name: "Lucid Trading",
    what: "Track evaluation/funded status, profit target, daily loss limit, drawdown and payouts.",
    prerequisites: "No public Lucid API has been verified. Rules can already be stored per account (Settings → Accounts → Prop-firm rules); automatic sync only if an official integration exists.",
  },
  {
    name: "TradingView",
    what: "Receive webhook alerts and link them to journal entries. Alerts are stored separately and are never treated as executed trades.",
    prerequisites: "Requires a TradingView plan with webhooks and a publicly reachable HTTPS deployment of this app.",
  },
  {
    name: "CSV import",
    what: "Import fills exported from Tradovate or other platforms, with duplicate prevention.",
    prerequisites: "Planned for Phase 4. The database already stores source + external id for idempotent imports.",
  },
];

export default function IntegrationsSettings() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        No integrations are connected. TRADING HQ works fully with manual entry; nothing on this page is simulated.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {PROVIDERS.map((p) => (
          <Card key={p.name} title={<span className="flex items-center gap-2 normal-case tracking-normal">{p.name} <Badge>Not connected</Badge></span>}>
            <dl className="space-y-2 text-sm">
              <div><dt className="label">Planned capability</dt><dd>{p.what}</dd></div>
              <div><dt className="label">Before it can be built</dt><dd className="text-muted">{p.prerequisites}</dd></div>
              <div><dt className="label">Last sync</dt><dd className="text-faint">Never</dd></div>
            </dl>
          </Card>
        ))}
      </div>
    </div>
  );
}
