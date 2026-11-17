"use client";
import { useLocale, useSetLocale, useT } from "@/lib/i18n/client";
import { getDict, LOCALES } from "@/lib/i18n";
import { cx } from "./ui";

/** EN / ქა toggle. English is the default; the choice is stored in a cookie. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useT();
  const { set, pending } = useSetLocale();
  return (
    <div role="radiogroup" aria-label={t.topbar.language} className={cx("inline-flex h-10 items-center rounded-xl border border-line bg-surface-2 p-1", pending && "opacity-70", className)}>
      {LOCALES.map((l) => (
        <button key={l} type="button" role="radio" aria-checked={locale === l} onClick={() => locale !== l && set(l)}
          title={getDict(l).meta.name}
          className={cx("h-full min-w-9 rounded-lg px-2 text-xs font-bold transition-colors",
            locale === l ? "bg-accent text-accent-fg" : "text-muted hover:text-fg")}>
          {getDict(l).meta.short}
        </button>
      ))}
    </div>
  );
}
