import { Badge, Card } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Integrations" };

export default async function IntegrationsSettings() {
  const t = await getT();
  const S = t.set;
  const providers = [
    { name: "Tradovate", what: S.tradovateWhat, prerequisites: S.tradovateReq },
    { name: "Lucid Trading", what: S.lucidWhat, prerequisites: S.lucidReq },
    { name: "TradingView", what: S.tvWhat, prerequisites: S.tvReq },
    { name: S.csvName, what: S.csvWhat, prerequisites: S.csvReq },
  ];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{S.integrationsIntro}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {providers.map((p) => (
          <Card key={p.name} title={<span className="flex items-center gap-2">{p.name} <Badge>{S.notConnected}</Badge></span>}>
            <dl className="space-y-3 text-sm">
              <div><dt className="label">{S.planned}</dt><dd>{p.what}</dd></div>
              <div><dt className="label">{S.before}</dt><dd className="text-muted">{p.prerequisites}</dd></div>
              <div><dt className="label">{S.lastSync}</dt><dd className="text-faint">{S.never}</dd></div>
            </dl>
          </Card>
        ))}
      </div>
    </div>
  );
}
