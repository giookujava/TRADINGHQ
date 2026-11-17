"use client";
import { useRouter } from "next/navigation";
import { createContext, useContext, useTransition, type ReactNode } from "react";
import { getDict, LOCALE_COOKIE, type Dict, type Locale } from "./index";

const Ctx = createContext<{ locale: Locale; t: Dict }>({ locale: "en", t: getDict("en") });

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <Ctx.Provider value={{ locale, t: getDict(locale) }}>{children}</Ctx.Provider>;
}

export function useT(): Dict {
  return useContext(Ctx).t;
}
export function useLocale(): Locale {
  return useContext(Ctx).locale;
}

/** Persist the locale in a cookie (read by the server) and re-render server components. */
export function useSetLocale() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (locale: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = locale;
    start(() => router.refresh());
  };
  return { set, pending };
}
