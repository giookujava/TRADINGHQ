"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const TABS = [
  ["/settings", "Profile"],
  ["/settings/accounts", "Accounts"],
  ["/settings/instruments", "Instruments"],
  ["/settings/journal", "Strategies, tags & fields"],
  ["/settings/data", "Data & backups"],
  ["/settings/integrations", "Integrations"],
] as const;

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav className="mt-3 flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          className={cx(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm",
            pathname === href ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
