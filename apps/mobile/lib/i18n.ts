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

const en = require("./i18n/locales/en.json");
const de = require("./i18n/locales/de.json");
const uk = require("./i18n/locales/uk.json");
const ru = require("./i18n/locales/ru.json");
const pl = require("./i18n/locales/pl.json");
const es = require("./i18n/locales/es.json");
const fr = require("./i18n/locales/fr.json");
const it = require("./i18n/locales/it.json");
const nl = require("./i18n/locales/nl.json");
const pt = require("./i18n/locales/pt.json");
const el = require("./i18n/locales/el.json");
const ro = require("./i18n/locales/ro.json");
const hu = require("./i18n/locales/hu.json");
const cs = require("./i18n/locales/cs.json");
const sv = require("./i18n/locales/sv.json");
const da = require("./i18n/locales/da.json");
const fi = require("./i18n/locales/fi.json");
const sk = require("./i18n/locales/sk.json");
const bg = require("./i18n/locales/bg.json");
const hr = require("./i18n/locales/hr.json");
const sl = require("./i18n/locales/sl.json");
const et = require("./i18n/locales/et.json");
const lv = require("./i18n/locales/lv.json");
const lt = require("./i18n/locales/lt.json");
const mt = require("./i18n/locales/mt.json");
const ga = require("./i18n/locales/ga.json");

const resources: Record<string, { translation: Record<string, string> }> = {
  en: { translation: en },
  de: { translation: de },
  uk: { translation: uk },
  ru: { translation: ru },
  pl: { translation: pl },
  es: { translation: es },
  fr: { translation: fr },
  it: { translation: it },
  nl: { translation: nl },
  pt: { translation: pt },
  el: { translation: el },
  ro: { translation: ro },
  hu: { translation: hu },
  cs: { translation: cs },
  sv: { translation: sv },
  da: { translation: da },
  fi: { translation: fi },
  sk: { translation: sk },
  bg: { translation: bg },
  hr: { translation: hr },
  sl: { translation: sl },
  et: { translation: et },
  lv: { translation: lv },
  lt: { translation: lt },
  mt: { translation: mt },
  ga: { translation: ga },
};

let initPromise: Promise<void> | null = null;

export async function initI18n(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const lng = await resolveInitialLanguage();
    await i18n.use(initReactI18next).init({
      resources,
      lng,
      fallbackLng: "en",
      supportedLngs: SUPPORTED_CODES,
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    } as InitOptions);
  })();
  return initPromise;
}

export async function changeLanguage(code: string): Promise<void> {
  if (!SUPPORTED_CODES.includes(code as SupportedLanguageCode)) return;
  await setStoredLanguage(code);
  await i18n.changeLanguage(code);
}
