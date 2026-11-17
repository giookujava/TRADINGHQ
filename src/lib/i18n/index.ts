import { en, fmt, type Dict } from "./en";
import { ka } from "./ka";

export type Locale = "en" | "ka";
export const LOCALES: Locale[] = ["en", "ka"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "thq-locale";

const DICTS: Record<Locale, Dict> = { en, ka };

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "ka";
}
export function getDict(locale: Locale): Dict {
  return DICTS[locale] ?? en;
}
export { fmt, type Dict };
