import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { DEFAULT_LOCALE, getDict, isLocale, LOCALE_COOKIE, type Locale } from "./index";

/** Locale from the `thq-locale` cookie (English by default). Cached per request. */
export const getLocale = cache(async (): Promise<Locale> => {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
});

export async function getT() {
  return getDict(await getLocale());
}
