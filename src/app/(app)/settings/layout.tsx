import { PageHeader } from "@/components/ui";
import { SettingsTabs } from "./tabs";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader eyebrow="System" title="Settings" subtitle="Preferences, accounts, contract specs, journal fields, data and integrations." />
      <SettingsTabs />
      <div className="mt-6">{children}</div>
    </div>
  );
}
