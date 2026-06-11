#!/usr/bin/env node
/**
 * Build lib/i18n/patches/core-surfaces.json — EU translations for auth/legal/planner/chat keys.
 * Run: node scripts/build-core-surfaces-patch.mjs && node scripts/sync-i18n-keys.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const enPath = path.join(__dirname, "..", "lib", "i18n", "locales", "en.json");
const outPath = path.join(__dirname, "..", "lib", "i18n", "patches", "core-surfaces.json");

const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
const CORE_PREFIXES = [
  "auth.splash.",
  "legal.",
  "auth.verify.",
  "auth.reset.",
  "auth.resetConfirm.",
  "auth.emailVerified.",
  "auth.welcomeBack.",
  "auth.callback.",
  "notFound.",
  "notifications.inbox",
  "notifications.empty",
  "chat.loading",
  "chat.empty",
  "chat.newChat",
  "chat.eventChat",
  "chat.groupChat",
  "chat.unknown",
  "chat.loadFailed",
  "chat.noMessages",
  "chat.message",
  "chat.photo",
  "chat.voice",
  "common.weakPassword",
  "common.success",
  "common.sent",
  "common.pasteLink",
  "common.mismatch",
  "common.tryAgain",
];

const coreKeys = Object.keys(en).filter((k) =>
  CORE_PREFIXES.some((p) => k === p.replace(/\.$/, "") || k.startsWith(p))
);

/** Per-locale overrides for core surface keys (EU + uk + ru). */
const LOCALE_OVERRIDES = {
  de: {
    "auth.splash.tagline": "Wo jede Verbindung mit einem Augenzwinkern beginnt 😉",
    "legal.termsTitle": "Nutzungsbedingungen",
    "legal.acceptAndContinue": "Akzeptieren und fortfahren",
    "auth.verify.title": "Bitte bestätige deine E-Mail",
    "auth.callback.completing": "Anmeldung wird abgeschlossen…",
    "notFound.title": "Ups 👀",
    "chat.loadingChats": "Chats werden geladen…",
  },
  fr: {
    "auth.splash.tagline": "Là où chaque connexion commence par un clin d'œil 😉",
    "legal.termsTitle": "Conditions générales",
    "legal.acceptAndContinue": "Accepter et continuer",
    "auth.verify.title": "Veuillez confirmer votre e-mail",
    "auth.callback.completing": "Connexion en cours…",
    "notFound.title": "Oups 👀",
    "chat.loadingChats": "Chargement des discussions…",
  },
  es: {
    "auth.splash.tagline": "Donde cada conexión empieza con un guiño 😉",
    "legal.termsTitle": "Términos y condiciones",
    "legal.acceptAndContinue": "Aceptar y continuar",
    "auth.verify.title": "Confirma tu correo electrónico",
    "auth.callback.completing": "Completando inicio de sesión…",
    "notFound.title": "Ups 👀",
    "chat.loadingChats": "Cargando chats…",
  },
  it: {
    "auth.splash.tagline": "Dove ogni connessione inizia con un occhiolino 😉",
    "legal.termsTitle": "Termini e condizioni",
    "legal.acceptAndContinue": "Accetta e continua",
    "auth.verify.title": "Conferma la tua e-mail",
    "auth.callback.completing": "Accesso in corso…",
    "notFound.title": "Ops 👀",
    "chat.loadingChats": "Caricamento chat…",
  },
  pl: {
    "auth.splash.tagline": "Gdzie każde połączenie zaczyna się od mrugnięcia 😉",
    "legal.termsTitle": "Regulamin",
    "legal.acceptAndContinue": "Akceptuj i kontynuuj",
    "auth.verify.title": "Potwierdź swój e-mail",
    "auth.callback.completing": "Kończenie logowania…",
    "notFound.title": "Ups 👀",
    "chat.loadingChats": "Ładowanie czatów…",
  },
  nl: {
    "auth.splash.tagline": "Waar elke connectie begint met een knipoog 😉",
    "legal.termsTitle": "Algemene voorwaarden",
    "legal.acceptAndContinue": "Accepteren en doorgaan",
    "auth.verify.title": "Bevestig je e-mailadres",
    "auth.callback.completing": "Aanmelden voltooien…",
    "notFound.title": "Oeps 👀",
    "chat.loadingChats": "Chats laden…",
  },
  pt: {
    "auth.splash.tagline": "Onde cada conexão começa com uma piscadela 😉",
    "legal.termsTitle": "Termos e condições",
    "legal.acceptAndContinue": "Aceitar e continuar",
    "auth.verify.title": "Confirme o seu e-mail",
    "auth.callback.completing": "A concluir início de sessão…",
    "notFound.title": "Ups 👀",
    "chat.loadingChats": "A carregar chats…",
  },
  uk: {
    "auth.splash.tagline": "Де кожен зв'язок починається з підморгування 😉",
    "legal.termsTitle": "Умови використання",
    "legal.acceptAndContinue": "Прийняти та продовжити",
    "auth.verify.title": "Підтвердьте свою електронну пошту",
    "auth.callback.completing": "Завершення входу…",
    "notFound.title": "Упс 👀",
    "chat.loadingChats": "Завантаження чатів…",
  },
  ru: {
    "auth.splash.tagline": "Где каждое знакомство начинается с подмигивания 😉",
    "legal.termsTitle": "Условия использования",
    "legal.acceptAndContinue": "Принять и продолжить",
    "auth.verify.title": "Подтвердите вашу электронную почту",
    "auth.callback.completing": "Завершение входа…",
    "notFound.title": "Упс 👀",
    "chat.loadingChats": "Загрузка чатов…",
  },
};

const LOCALES = [
  "de", "uk", "ru", "pl", "es", "fr", "it", "nl", "pt", "el", "ro", "hu", "cs", "sv", "da", "fi",
  "sk", "bg", "hr", "sl", "et", "lv", "lt", "mt", "ga",
];

/** Copy planner/chat keys from de locale file where available (already translated). */
const deLocale = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "lib", "i18n", "locales", "de.json"), "utf8")
);

const patch = {};
for (const locale of LOCALES) {
  patch[locale] = {};
  const overrides = LOCALE_OVERRIDES[locale] ?? {};
  for (const key of coreKeys) {
    if (overrides[key]) {
      patch[locale][key] = overrides[key];
    } else if (locale !== "de" && LOCALE_OVERRIDES.de[key]) {
      // Fallback chain: explicit override > de string for shared EU keys > keep sync English
      patch[locale][key] = overrides[key] ?? deLocale[key] ?? en[key];
    } else if (deLocale[key] && deLocale[key] !== en[key]) {
      patch[locale][key] = deLocale[key];
    }
  }
}

fs.writeFileSync(outPath, `${JSON.stringify(patch, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath} (${LOCALES.length} locales, ${coreKeys.length} keys each).`);
