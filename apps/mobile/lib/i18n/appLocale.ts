/**
 * App language helpers — use for Intl/date formatting and non-React code paths.
 * Always reflects the user's chosen language (onboarding globe or Settings), not the OS locale.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { normalizeLanguageCode, type SupportedLanguageCode } from "../i18n";

/** BCP-47 tags for Intl APIs (better month/day names than bare language codes). */
const INTL_LOCALE_TAGS: Partial<Record<SupportedLanguageCode, string>> = {
  uk: "uk-UA",
  ru: "ru-RU",
  de: "de-DE",
  pl: "pl-PL",
  es: "es-ES",
  fr: "fr-FR",
  it: "it-IT",
  nl: "nl-NL",
  pt: "pt-PT",
  el: "el-GR",
  ro: "ro-RO",
  hu: "hu-HU",
  cs: "cs-CZ",
  sv: "sv-SE",
  da: "da-DK",
  fi: "fi-FI",
  sk: "sk-SK",
  bg: "bg-BG",
  hr: "hr-HR",
  sl: "sl-SI",
  et: "et-EE",
  lv: "lv-LV",
  lt: "lt-LT",
  mt: "mt-MT",
  ga: "ga-IE",
  en: "en-GB",
};

function localeTagForCode(code: SupportedLanguageCode): string {
  return INTL_LOCALE_TAGS[code] ?? code;
}

/** Current app language code (e.g. `uk`), normalized from i18n. */
export function getAppLanguageCode(): SupportedLanguageCode {
  return normalizeLanguageCode(i18n.language ?? "en");
}

/** BCP-47 tag for `Intl` / `toLocaleDateString` — follows app language, not device. */
export function getAppLocaleTag(): string {
  return localeTagForCode(getAppLanguageCode());
}

/** React hook — BCP-47 tag that updates when the user changes app language. */
export function useAppLocaleTag(): string {
  const { i18n } = useTranslation();
  return useMemo(
    () => localeTagForCode(normalizeLanguageCode(i18n.language)),
    [i18n.language]
  );
}

/*
 * Intl formatter cache. `Date#toLocale*String(locale, options)` and `new Intl.*Format()` build a
 * fresh ICU formatter on every call, which is ~50-100× slower than reusing one (noticeable in
 * lists: one call per chat bubble / planner row). Formatters are immutable, so cache them per
 * locale + options. Keys are few (a handful of option shapes × the active language).
 */
const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>();
const numberFormatCache = new Map<string, Intl.NumberFormat>();

function cacheKey(locale: string, options: object | undefined): string {
  return options ? `${locale}|${JSON.stringify(options)}` : locale;
}

/** Cached `Intl.DateTimeFormat` for `locale` (defaults to the app language). */
export function getDateTimeFormat(
  options?: Intl.DateTimeFormatOptions,
  locale: string = getAppLocaleTag()
): Intl.DateTimeFormat {
  const key = cacheKey(locale, options);
  let fmt = dateTimeFormatCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, options);
    dateTimeFormatCache.set(key, fmt);
  }
  return fmt;
}

/** Cached `Intl.NumberFormat` for `locale` (defaults to the app language). */
export function getNumberFormat(
  options?: Intl.NumberFormatOptions,
  locale: string = getAppLocaleTag()
): Intl.NumberFormat {
  const key = cacheKey(locale, options);
  let fmt = numberFormatCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, options);
    numberFormatCache.set(key, fmt);
  }
  return fmt;
}

const DEFAULT_DATE: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
const DEFAULT_DATE_TIME: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};
const DEFAULT_TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };

/** Date in the app language ("Sat, 26 Sept"). Returns "" for an invalid date. */
export function formatAppDate(
  date: Date,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE,
  locale?: string
): string {
  if (Number.isNaN(date.getTime())) return "";
  return getDateTimeFormat(options, locale).format(date);
}

/** Date + time in the app language. Returns "" for an invalid date. */
export function formatAppDateTime(
  date: Date,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE_TIME,
  locale?: string
): string {
  if (Number.isNaN(date.getTime())) return "";
  return getDateTimeFormat(options, locale).format(date);
}

/** Clock time in the app language (24h in most of Europe, 12h in en-US). "" for an invalid date. */
export function formatAppTime(
  date: Date,
  options: Intl.DateTimeFormatOptions = DEFAULT_TIME,
  locale?: string
): string {
  if (Number.isNaN(date.getTime())) return "";
  return getDateTimeFormat(options, locale).format(date);
}

/** Number in the app language ("1,234" / "1.234" / "1 234"). */
export function formatAppNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
  locale?: string
): string {
  return getNumberFormat(options, locale).format(value);
}
