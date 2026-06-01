/**
 * Winkly i18n — Multi-language support
 * Uses i18next + react-i18next + expo-localization.
 * User language override persisted in AsyncStorage.
 */

import i18n from "i18next";
import type { InitOptions } from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "winkly_app_language";

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

async function resolveInitialLanguage(): Promise<string> {
  const stored = await getStoredLanguage();
  if (stored && SUPPORTED_CODES.includes(stored as SupportedLanguageCode)) return stored;

  const deviceCode = Localization.getLocales()[0]?.languageCode ?? "en";
  const match = SUPPORTED_CODES.find((c) => c === deviceCode);
  return match ?? "en";
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
    const lng = await resolveInitialLanguage();
    await i18n.use(initReactI18next).init({
      // Start with no eagerly-bundled resources; load only what we need below.
      resources: {},
      lng,
      fallbackLng: "en",
      supportedLngs: SUPPORTED_CODES,
      partialBundledLanguages: true,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    } as InitOptions);
    // Always load the fallback; load the detected language only if different.
    addLanguageBundle("en");
    if (lng !== "en") addLanguageBundle(lng);
  })();
  return initPromise;
}

export async function changeLanguage(code: string): Promise<void> {
  if (!SUPPORTED_CODES.includes(code as SupportedLanguageCode)) return;
  addLanguageBundle(code);
  await setStoredLanguage(code);
  await i18n.changeLanguage(code);
}
