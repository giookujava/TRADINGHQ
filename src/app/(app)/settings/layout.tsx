import { SettingsTabs } from "./tabs";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
      <SettingsTabs />
      <div className="mt-5">{children}</div>
    </div>
  );
}
