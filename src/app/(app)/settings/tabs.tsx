"use client";
import { Database, Layers, Plug, Tag, UserRound, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const TABS = [
  ["/settings", "Profile", UserRound],
  ["/settings/accounts", "Accounts", Wallet],
  ["/settings/instruments", "Instruments", Layers],
  ["/settings/journal", "Strategies, tags & fields", Tag],
  ["/settings/data", "Data & backups", Database],
  ["/settings/integrations", "Integrations", Plug],
] as const;

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections" className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TABS.map(([href, label, Icon]) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? "page" : undefined}
          className={cx(
            "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            pathname === href ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
          )}
        >
          <Icon className="h-4 w-4 opacity-70" aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}

