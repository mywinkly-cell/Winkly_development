#!/usr/bin/env node
/**
 * Apply native translations for newly added core-surface keys across all EU locales.
 * Only overwrites keys where the locale still matches English (sync fallback).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "..", "lib", "i18n", "locales");
const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));

/** Native translations per locale code (subset of new keys — highest-visibility surfaces). */
const T = {
  de: {
    "auth.splash.tagline": "Wo jede Verbindung mit einem Augenzwinkern beginnt 😉",
    "legal.termsTitle": "Nutzungsbedingungen",
    "legal.termsSubtitle": "Um Winkly zu nutzen, lies bitte unsere Nutzungsbedingungen und akzeptiere unsere Cookie-Nutzung. Datenschutz und Impressum findest du jederzeit unter Einstellungen → Support & Rechtliches → Rechtliches.",
    "legal.acceptTermsPrefix": "Ich habe die",
    "legal.termsOfService": "Nutzungsbedingungen",
    "legal.acceptCookiesPrefix": "Ich akzeptiere Cookies und ähnliche Technologien gemäß unserem",
    "legal.cookieNotice": "Cookie-Hinweis",
    "legal.and": "und",
    "legal.privacyPolicy": "Datenschutzerklärung",
    "legal.acceptAndContinue": "Akzeptieren und fortfahren",
    "auth.verify.title": "Bitte bestätige deine E-Mail",
    "auth.verify.subtitle": "Wir haben dir einen Bestätigungslink geschickt. Tippe auf den Link, um deine E-Mail zu bestätigen und fortzufahren.\n\nDu kannst die App erst nutzen, wenn deine E-Mail bestätigt ist.",
    "auth.verify.resendTitle": "Keine E-Mail erhalten?",
    "auth.verify.emailPlaceholder": "E-Mail bei der Anmeldung",
    "auth.verify.resendButton": "Bestätigungs-E-Mail erneut senden",
    "auth.verify.backToSignIn": "Zurück zur Anmeldung",
    "auth.verify.signUpAgain": "Mit anderer E-Mail registriert? Erneut registrieren",
    "auth.emailVerified.title": "Deine E-Mail wurde bestätigt!",
    "auth.emailVerified.subtitle": "Profil wird eingerichtet…",
    "auth.welcomeBack.subtitle": "Dein Profil ist fast fertig. Vervollständige es für den nächsten Schritt.",
    "auth.welcomeBack.continue": "Weiter zur Einrichtung",
    "auth.callback.expiredLink": "Dieser Link ist abgelaufen. Bitte melde dich erneut an.",
    "auth.callback.completing": "Anmeldung wird abgeschlossen…",
    "notFound.title": "Ups 👀",
    "notFound.message": "Die gesuchte Seite existiert nicht oder wurde verschoben.",
    "notFound.goHome": "Zur Startseite",
    "notifications.inboxTitle": "Benachrichtigungen",
    "notifications.emptyTitle": "Noch keine Benachrichtigungen",
    "notifications.emptySubtitle": "Hier siehst du Updates zu Matches, Events und Nachrichten.",
    "chat.loadingChats": "Chats werden geladen…",
    "chat.emptyInbox": "Noch keine aktiven Chats. Zeit, ein Gespräch zu starten!",
    "chat.newChatButton": "+ Neuer Chat",
    "planner.settingsTitle": "Planer-Einstellungen",
    "planner.noPlansYet": "Noch keine Pläne",
    "planner.allTab": "Alle",
  },
  fr: {
    "auth.splash.tagline": "Là où chaque connexion commence par un clin d'œil 😉",
    "legal.termsTitle": "Conditions générales",
    "legal.acceptAndContinue": "Accepter et continuer",
    "auth.verify.title": "Veuillez confirmer votre e-mail",
    "auth.callback.completing": "Connexion en cours…",
    "notFound.title": "Oups 👀",
    "chat.loadingChats": "Chargement des discussions…",
    "planner.settingsTitle": "Paramètres du planificateur",
  },
  es: {
    "auth.splash.tagline": "Donde cada conexión empieza con un guiño 😉",
    "legal.termsTitle": "Términos y condiciones",
    "legal.acceptAndContinue": "Aceptar y continuar",
    "auth.verify.title": "Confirma tu correo electrónico",
    "auth.callback.completing": "Completando inicio de sesión…",
    "notFound.title": "Ups 👀",
    "chat.loadingChats": "Cargando chats…",
    "planner.settingsTitle": "Ajustes del planificador",
  },
  it: {
    "auth.splash.tagline": "Dove ogni connessione inizia con un occhiolino 😉",
    "legal.termsTitle": "Termini e condizioni",
    "legal.acceptAndContinue": "Accetta e continua",
    "auth.verify.title": "Conferma la tua e-mail",
    "auth.callback.completing": "Accesso in corso…",
    "notFound.title": "Ops 👀",
    "chat.loadingChats": "Caricamento chat…",
    "planner.settingsTitle": "Impostazioni planner",
  },
  pl: {
    "auth.splash.tagline": "Gdzie każde połączenie zaczyna się od mrugnięcia 😉",
    "legal.termsTitle": "Regulamin",
    "legal.acceptAndContinue": "Akceptuj i kontynuuj",
    "auth.verify.title": "Potwierdź swój e-mail",
    "auth.callback.completing": "Kończenie logowania…",
    "notFound.title": "Ups 👀",
    "chat.loadingChats": "Ładowanie czatów…",
    "planner.settingsTitle": "Ustawienia planera",
  },
  nl: {
    "auth.splash.tagline": "Waar elke connectie begint met een knipoog 😉",
    "legal.termsTitle": "Algemene voorwaarden",
    "legal.acceptAndContinue": "Accepteren en doorgaan",
    "auth.verify.title": "Bevestig je e-mailadres",
    "planner.settingsTitle": "Plannerinstellingen",
  },
  pt: {
    "auth.splash.tagline": "Onde cada conexão começa com uma piscadela 😉",
    "legal.termsTitle": "Termos e condições",
    "legal.acceptAndContinue": "Aceitar e continuar",
    "auth.verify.title": "Confirme o seu e-mail",
    "planner.settingsTitle": "Definições do planeador",
  },
  uk: {
    "auth.splash.tagline": "Де кожен зв'язок починається з підморгування 😉",
    "legal.termsTitle": "Умови використання",
    "legal.acceptAndContinue": "Прийняти та продовжити",
    "auth.verify.title": "Підтвердьте свою електронну пошту",
    "planner.settingsTitle": "Налаштування планувальника",
  },
  ru: {
    "auth.splash.tagline": "Где каждое знакомство начинается с подмигивания 😉",
    "legal.termsTitle": "Условия использования",
    "legal.acceptAndContinue": "Принять и продолжить",
    "auth.verify.title": "Подтвердите вашу электронную почту",
    "planner.settingsTitle": "Настройки планировщика",
  },
  cs: {
    "auth.splash.tagline": "Kde každé spojení začíná mrknutím 😉",
    "legal.termsTitle": "Obchodní podmínky",
    "legal.acceptAndContinue": "Přijmout a pokračovat",
    "auth.verify.title": "Potvrďte svůj e-mail",
    "planner.settingsTitle": "Nastavení plánovače",
  },
  sv: {
    "auth.splash.tagline": "Där varje kontakt börjar med en blinkning 😉",
    "legal.termsTitle": "Villkor",
    "legal.acceptAndContinue": "Acceptera och fortsätt",
    "auth.verify.title": "Bekräfta din e-post",
    "planner.settingsTitle": "Planeringsinställningar",
  },
  da: {
    "auth.splash.tagline": "Hvor hver forbindelse starter med et blink 😉",
    "legal.termsTitle": "Vilkår og betingelser",
    "legal.acceptAndContinue": "Acceptér og fortsæt",
    "auth.verify.title": "Bekræft din e-mail",
    "planner.settingsTitle": "Planlægningsindstillinger",
  },
  fi: {
    "auth.splash.tagline": "Missä jokainen yhteys alkaa silmäniskulla 😉",
    "legal.termsTitle": "Käyttöehdot",
    "legal.acceptAndContinue": "Hyväksy ja jatka",
    "auth.verify.title": "Vahvista sähköpostisi",
    "planner.settingsTitle": "Suunnittelijan asetukset",
  },
  ro: {
    "auth.splash.tagline": "Unde fiecare conexiune începe cu o clipire 😉",
    "legal.termsTitle": "Termeni și condiții",
    "legal.acceptAndContinue": "Acceptă și continuă",
    "auth.verify.title": "Confirmă-ți e-mailul",
    "planner.settingsTitle": "Setări planificator",
  },
  hu: {
    "auth.splash.tagline": "Ahol minden kapcsolat egy kacsintással kezdődik 😉",
    "legal.termsTitle": "Felhasználási feltételek",
    "legal.acceptAndContinue": "Elfogadom és folytatom",
    "auth.verify.title": "Erősítsd meg az e-mailed",
    "planner.settingsTitle": "Tervező beállításai",
  },
  el: {
    "auth.splash.tagline": "Όπου κάθε σύνδεση ξεκινά με ένα κλείσιμο του ματιού 😉",
    "legal.termsTitle": "Όροι και προϋποθέσεις",
    "legal.acceptAndContinue": "Αποδοχή και συνέχεια",
    "auth.verify.title": "Επιβεβαιώστε το email σας",
    "planner.settingsTitle": "Ρυθμίσεις προγραμματιστή",
  },
  hr: {
    "auth.splash.tagline": "Gdje svaka veza počinje namigom 😉",
    "legal.termsTitle": "Uvjeti korištenja",
    "legal.acceptAndContinue": "Prihvati i nastavi",
    "auth.verify.title": "Potvrdite svoj e-mail",
    "planner.settingsTitle": "Postavke planera",
  },
  bg: {
    "auth.splash.tagline": "Където всяка връзка започва с мигване 😉",
    "legal.termsTitle": "Общи условия",
    "legal.acceptAndContinue": "Приемам и продължавам",
    "auth.verify.title": "Потвърдете имейла си",
    "planner.settingsTitle": "Настройки на планера",
  },
  sk: {
    "auth.splash.tagline": "Kde každé spojenie začína mrknutím 😉",
    "legal.termsTitle": "Podmienky používania",
    "legal.acceptAndContinue": "Prijať a pokračovať",
    "auth.verify.title": "Potvrďte svoj e-mail",
    "planner.settingsTitle": "Nastavenia plánovača",
  },
  sl: {
    "auth.splash.tagline": "Kjer se vsaka povezava začne s pomežikom 😉",
    "legal.termsTitle": "Pogoji uporabe",
    "legal.acceptAndContinue": "Sprejmi in nadaljuj",
    "auth.verify.title": "Potrdite svoj e-poštni naslov",
    "planner.settingsTitle": "Nastavitve načrtovalnika",
  },
  et: {
    "auth.splash.tagline": "Kus iga ühendus algab silmapilgutusega 😉",
    "legal.termsTitle": "Kasutustingimused",
    "legal.acceptAndContinue": "Nõustu ja jätka",
    "auth.verify.title": "Kinnita oma e-post",
    "planner.settingsTitle": "Plaanija seaded",
  },
  lv: {
    "auth.splash.tagline": "Kur katra saikne sākas ar mirkšķinājumu 😉",
    "legal.termsTitle": "Lietošanas noteikumi",
    "legal.acceptAndContinue": "Pieņemt un turpināt",
    "auth.verify.title": "Apstipriniet savu e-pastu",
    "planner.settingsTitle": "Plānotāja iestatījumi",
  },
  lt: {
    "auth.splash.tagline": "Kur kiekvienas ryšys prasideda mirksniu 😉",
    "legal.termsTitle": "Naudojimo sąlygos",
    "legal.acceptAndContinue": "Sutinku ir tęsti",
    "auth.verify.title": "Patvirtinkite el. paštą",
    "planner.settingsTitle": "Planuoklio nustatymai",
  },
  mt: {
    "auth.splash.tagline": "Fejn kull konnessjoni tibda bi ċilja 😉",
    "legal.termsTitle": "Termini u kondizzjonijiet",
    "legal.acceptAndContinue": "Aċċetta u kompli",
    "auth.verify.title": "Ikkonferma l-email tiegħek",
    "planner.settingsTitle": "Settings tal-planner",
  },
  ga: {
    "auth.splash.tagline": "Áit a dtosaíonn gach nasc le caochadh 😉",
    "legal.termsTitle": "Téarmaí agus coinníollacha",
    "legal.acceptAndContinue": "Glac leis agus lean ar aghaidh",
    "auth.verify.title": "Deimhnigh do ríomhphost",
    "planner.settingsTitle": "Socruithe an phleanálaí",
  },
};

const files = fs.readdirSync(localesDir).filter((f) => f.endsWith(".json") && f !== "en.json");
let updated = 0;
for (const file of files) {
  const locale = file.replace(".json", "");
  const map = T[locale];
  if (!map) continue;
  const filePath = path.join(localesDir, file);
  const loc = JSON.parse(fs.readFileSync(filePath, "utf8"));
  let changed = false;
  for (const [key, value] of Object.entries(map)) {
    if (loc[key] === en[key] || loc[key] === undefined) {
      loc[key] = value;
      changed = true;
    }
  }
  if (changed) {
    const sorted = Object.fromEntries(Object.keys(loc).sort().map((k) => [k, loc[k]]));
    fs.writeFileSync(filePath, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
    updated++;
    console.log(`Translated ${file}`);
  }
}
console.log(updated ? `\nUpdated ${updated} locale(s).` : "\nNo locales updated.");
