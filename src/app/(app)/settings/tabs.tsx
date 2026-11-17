"use client";
import { Database, Layers, Plug, Tag, UserRound, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

export function SettingsTabs() {
  const t = useT();
  const pathname = usePathname();
  const tabs = [
    ["/settings", t.settings.profile, UserRound],
    ["/settings/accounts", t.settings.accounts, Wallet],
    ["/settings/instruments", t.settings.instruments, Layers],
    ["/settings/journal", t.settings.journal, Tag],
    ["/settings/data", t.settings.data, Database],
    ["/settings/integrations", t.settings.integrations, Plug],
  ] as const;
  return (
    <nav aria-label={t.settings.title} className="flex gap-1.5 overflow-x-auto rounded-2xl border border-line bg-surface p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map(([href, label, Icon]) => {
        const active = pathname === href;
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={cx("inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-bold transition-colors",
              active ? "bg-accent text-accent-fg shadow-glow" : "text-muted hover:bg-surface-2 hover:text-fg")}>
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
