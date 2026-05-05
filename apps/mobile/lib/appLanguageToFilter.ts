/**
 * Maps app language code (i18n) to filter/profile language option name.
 * Default app language is English; used for filter default and display.
 */

import { LANGUAGE_OPTIONS } from "@/constants/profileOptions";

const CODE_TO_FILTER_NAME: Record<string, string> = {
  en: "English",
  de: "German",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  pl: "Polish",
  ru: "Russian",
  uk: "Ukrainian",
  tr: "Turkish",
  ar: "Arabic",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
};

const FILTER_OPTIONS_SET = new Set(LANGUAGE_OPTIONS.filter((l) => l !== "Any"));

/** Returns the filter-language name for the given app language code, or "English" if no match. */
export function getDefaultFilterLanguage(code: string | undefined): string {
  if (!code) return "English";
  const normalized = code.split("-")[0].toLowerCase();
  const name = CODE_TO_FILTER_NAME[normalized];
  if (name && FILTER_OPTIONS_SET.has(name)) return name;
  return "English";
}
