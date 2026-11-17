import { PageHeader } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { SettingsTabs } from "./tabs";

export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const t = await getT();
  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader title={t.settings.title} subtitle={t.settings.subtitle} />
      <SettingsTabs />
      <div className="mt-6">{children}</div>
    </div>
  );
}
