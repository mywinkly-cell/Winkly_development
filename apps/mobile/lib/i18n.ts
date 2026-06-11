/**
 * Winkly i18n — Multi-language support
 * Uses i18next + react-i18next. On first launch, uses device locale when supported; English otherwise.
 * User language override persisted in AsyncStorage.
 */

import i18n from "i18next";
import type { InitOptions } from "i18next";
import { initReactI18next } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";

const STORAGE_KEY = "winkly_app_language";
/** Set when the user picks a language (onboarding globe or Settings). */
const EXPLICIT_LANGUAGE_KEY = "winkly_app_language_explicit";

export async function hasExplicitLanguageChoice(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(EXPLICIT_LANGUAGE_KEY)) === "true";
  } catch {
    return false;
  }
}

async function setExplicitLanguageChoice(explicit: boolean): Promise<void> {
  try {
    if (explicit) await AsyncStorage.setItem(EXPLICIT_LANGUAGE_KEY, "true");
    else await AsyncStorage.removeItem(EXPLICIT_LANGUAGE_KEY);
  } catch {
    // ignore
  }
}

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "de", name: "Deutsch" },
  { code: "uk", name: "Українська" },
  { code: "ru", name: "Русский" },
  { code: "pl", name: "Polski" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "it", name: "Italiano" },
  { code: "nl", name: "Nederlands" },
  { code: "pt", name: "Português" },
  { code: "el", name: "Ελληνικά" },
  { code: "ro", name: "Română" },
  { code: "hu", name: "Magyar" },
  { code: "cs", name: "Čeština" },
  { code: "sv", name: "Svenska" },
  { code: "da", name: "Dansk" },
  { code: "fi", name: "Suomi" },
  { code: "sk", name: "Slovenčina" },
  { code: "bg", name: "Български" },
  { code: "hr", name: "Hrvatski" },
  { code: "sl", name: "Slovenščina" },
  { code: "et", name: "Eesti" },
  { code: "lv", name: "Latviešu" },
  { code: "lt", name: "Lietuvių" },
  { code: "mt", name: "Malti" },
  { code: "ga", name: "Gaeilge" },
] as const;

export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];
export const SUPPORTED_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

/** App language on first launch and when the user has not chosen a language in Settings. */
export const DEFAULT_LANGUAGE: SupportedLanguageCode = "en";

/** Map i18n / BCP-47 tags to a supported app language code. */
export function normalizeLanguageCode(raw: string | null | undefined): SupportedLanguageCode {
  const base = (raw ?? "en").split("-")[0]?.toLowerCase() ?? "en";
  if (SUPPORTED_CODES.includes(base as SupportedLanguageCode)) {
    return base as SupportedLanguageCode;
  }
  return DEFAULT_LANGUAGE;
}

async function getStoredLanguage(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function setStoredLanguage(code: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, code);
  } catch {
    // ignore
  }
}

/** Map BCP-47 tag (e.g. de-DE) to a supported app language code, or null. */
function deviceLanguageToSupportedCode(): SupportedLanguageCode | null {
  const locales = getLocales();
  for (const locale of locales) {
    const code = locale.languageCode?.toLowerCase();
    if (code && SUPPORTED_CODES.includes(code as SupportedLanguageCode)) {
      return code as SupportedLanguageCode;
    }
  }
  return null;
}

async function resolveInitialLanguage(): Promise<string> {
  const stored = await getStoredLanguage();
  if (stored) return normalizeLanguageCode(stored);
  return deviceLanguageToSupportedCode() ?? DEFAULT_LANGUAGE;
}

type TranslationModule = Record<string, string> | { default: Record<string, string> };

/**
 * Lazy locale loaders. The require() calls live inside arrow functions so the
 * JSON is only parsed/evaluated when the language is actually requested — not
 * all 26 at startup. This keeps cold-start JS work proportional to the single
 * detected language (+ the `en` fallback) instead of every supported locale.
 *
 * Note: Metro still includes the JSON in the bundle; the win is startup parse
 * time and memory, which is the dominant cost on device cold launch.
 */
const localeLoaders: Record<SupportedLanguageCode, () => TranslationModule> = {
  en: () => require("./i18n/locales/en.json"),
  de: () => require("./i18n/locales/de.json"),
  uk: () => require("./i18n/locales/uk.json"),
  ru: () => require("./i18n/locales/ru.json"),
  pl: () => require("./i18n/locales/pl.json"),
  es: () => require("./i18n/locales/es.json"),
  fr: () => require("./i18n/locales/fr.json"),
  it: () => require("./i18n/locales/it.json"),
  nl: () => require("./i18n/locales/nl.json"),
  pt: () => require("./i18n/locales/pt.json"),
  el: () => require("./i18n/locales/el.json"),
  ro: () => require("./i18n/locales/ro.json"),
  hu: () => require("./i18n/locales/hu.json"),
  cs: () => require("./i18n/locales/cs.json"),
  sv: () => require("./i18n/locales/sv.json"),
  da: () => require("./i18n/locales/da.json"),
  fi: () => require("./i18n/locales/fi.json"),
  sk: () => require("./i18n/locales/sk.json"),
  bg: () => require("./i18n/locales/bg.json"),
  hr: () => require("./i18n/locales/hr.json"),
  sl: () => require("./i18n/locales/sl.json"),
  et: () => require("./i18n/locales/et.json"),
  lv: () => require("./i18n/locales/lv.json"),
  lt: () => require("./i18n/locales/lt.json"),
  mt: () => require("./i18n/locales/mt.json"),
  ga: () => require("./i18n/locales/ga.json"),
};

const loadedLanguages = new Set<string>();

/** Resolve a require()'d JSON module to its translation object (Metro vs. ESM-interop safe). */
function resolveTranslation(mod: TranslationModule): Record<string, string> {
  const maybe = mod as { default?: Record<string, string> };
  return maybe.default ?? (mod as Record<string, string>);
}

/** Parse + register a locale bundle exactly once. */
function addLanguageBundle(code: string): void {
  if (loadedLanguages.has(code)) return;
  const loader = localeLoaders[code as SupportedLanguageCode];
  if (!loader) return;
  i18n.addResourceBundle(code, "translation", resolveTranslation(loader()), true, true);
  loadedLanguages.add(code);
}

/** Public: ensure a supported language is loaded before use (idempotent). */
export async function ensureLanguageLoaded(code: string): Promise<void> {
  if (SUPPORTED_CODES.includes(code as SupportedLanguageCode)) addLanguageBundle(code);
}

let initPromise: Promise<void> | null = null;

export async function initI18n(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const stored = await getStoredLanguage();
    let explicit = await hasExplicitLanguageChoice();
    // Users who picked a language before the explicit flag existed still have a stored code.
    if (stored && !explicit) {
      await setExplicitLanguageChoice(true);
      explicit = true;
    }
    const lng = normalizeLanguageCode(await resolveInitialLanguage());
    // No English fallback — show only the active language (avoids EN/UK mix on partial locales).
    const fallbackLng = false;

    await i18n.use(initReactI18next).init({
      resources: {},
      lng,
      fallbackLng,
      supportedLngs: SUPPORTED_CODES,
      partialBundledLanguages: false,
      load: "languageOnly",
      nonExplicitSupportedLngs: true,
      keySeparator: false,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    } as InitOptions);

    addLanguageBundle(lng);
  })();
  return initPromise;
}

/** User chose a language (onboarding globe or Settings) — persist and apply everywhere. */
export async function setUserLanguage(code: string): Promise<void> {
  const normalized = normalizeLanguageCode(code);
  addLanguageBundle(normalized);
  await setExplicitLanguageChoice(true);
  await setStoredLanguage(normalized);
  if (i18n.options) {
    i18n.options.fallbackLng = false;
    i18n.options.partialBundledLanguages = false;
  }
  await i18n.changeLanguage(normalized);
}

/** @deprecated Prefer setUserLanguage — kept for call sites that only switch language. */
export async function changeLanguage(code: string): Promise<void> {
  await setUserLanguage(code);
}
