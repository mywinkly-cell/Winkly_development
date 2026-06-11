/**
 * App language helpers — use for Intl/date formatting and non-React code paths.
 * Always reflects the user's chosen language (onboarding globe or Settings), not the OS locale.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { normalizeLanguageCode, type SupportedLanguageCode } from "@/lib/i18n";

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

export function formatAppDate(
  date: Date,
  options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }
): string {
  return date.toLocaleDateString(getAppLocaleTag(), options);
}

export function formatAppDateTime(
  date: Date,
  options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }
): string {
  return date.toLocaleString(getAppLocaleTag(), options);
}
