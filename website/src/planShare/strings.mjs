// User-facing strings for the shared-plan page (mywinkly.de/p/<token>).
// The page is shown to people who don't have Winkly yet, so it follows their browser language
// (Accept-Language). Add a language by adding a block with the same keys; English is the fallback.
// Placeholders use {{name}} like the app's i18n.

export const PLAN_PAGE_STRINGS = {
  en: {
    invitedBy: "{{host}} planned something for you",
    invitedAnon: "You're invited",
    imIn: "I'm in 🙌",
    firstName: "First name",
    email: "Email",
    send: "Count me in",
    sending: "Sending…",
    privacyLine:
      "We only use your name and email to tell {{host}} you're in and to add this plan to your Winkly account if you sign up with the same email.",
    privacyLineAnon:
      "We only use your name and email to tell the host you're in and to add this plan to your Winkly account if you sign up with the same email.",
    privacyLink: "Privacy policy",
    imprint: "Imprint",
    okTitle: "You're in! 🎉",
    okBody: "{{host}} can see it now. Get Winkly and sign up with the same email — the plan will be waiting in your planner.",
    okBodyAnon: "The host can see it now. Get Winkly and sign up with the same email — the plan will be waiting in your planner.",
    openInApp: "Open in Winkly",
    getApp: "Get the app",
    errorRateLimited: "Too many tries — please wait a few minutes and try again.",
    errorInvalid: "Please enter your first name and a valid email.",
    errorNetwork: "Couldn't send that. Check your connection and try again.",
    statusFullTitle: "This plan is full",
    statusFullBody: "Every spot has been taken. Ask the host to send you a new link.",
    statusExpiredTitle: "This link has expired",
    statusExpiredBody: "Invitation links last 7 days. Ask the host to share the plan again.",
    statusRevokedTitle: "This link is no longer active",
    statusRevokedBody: "The host turned this invitation off.",
    statusUnavailableTitle: "This plan was called off",
    statusUnavailableBody: "It's not happening anymore — maybe plan something new together?",
    statusNotFoundTitle: "We couldn't find this plan",
    statusNotFoundBody: "Check that the link is complete, or ask the host to share it again.",
    statusErrorTitle: "Something went wrong",
    statusErrorBody: "Please try again in a moment.",
    ogDescriptionWithWhen: "{{when}} · You in? Answer in one tap — no app needed.",
    ogDescription: "You in? Answer in one tap — no app needed.",
    tagline: "Winkly — your AI planner for real-life plans and connections.",
  },
  de: {
    invitedBy: "{{host}} hat etwas für euch geplant",
    invitedAnon: "Du bist eingeladen",
    imIn: "Ich bin dabei 🙌",
    firstName: "Vorname",
    email: "E-Mail",
    send: "Ich bin dabei",
    sending: "Wird gesendet…",
    privacyLine:
      "Wir nutzen deinen Namen und deine E-Mail nur, um {{host}} Bescheid zu geben und den Plan in dein Winkly-Konto zu übernehmen, falls du dich mit derselben E-Mail registrierst.",
    privacyLineAnon:
      "Wir nutzen deinen Namen und deine E-Mail nur, um der Gastgeberin bzw. dem Gastgeber Bescheid zu geben und den Plan in dein Winkly-Konto zu übernehmen, falls du dich mit derselben E-Mail registrierst.",
    privacyLink: "Datenschutzerklärung",
    imprint: "Impressum",
    okTitle: "Du bist dabei! 🎉",
    okBody: "{{host}} sieht es jetzt. Hol dir Winkly und registriere dich mit derselben E-Mail — der Plan wartet dann in deinem Planer.",
    okBodyAnon: "Die Einladung ist bestätigt. Hol dir Winkly und registriere dich mit derselben E-Mail — der Plan wartet dann in deinem Planer.",
    openInApp: "In Winkly öffnen",
    getApp: "App holen",
    errorRateLimited: "Zu viele Versuche — bitte warte ein paar Minuten.",
    errorInvalid: "Bitte gib deinen Vornamen und eine gültige E-Mail ein.",
    errorNetwork: "Senden fehlgeschlagen. Prüfe deine Verbindung und versuch es nochmal.",
    statusFullTitle: "Dieser Plan ist voll",
    statusFullBody: "Alle Plätze sind vergeben. Frag nach einem neuen Link.",
    statusExpiredTitle: "Dieser Link ist abgelaufen",
    statusExpiredBody: "Einladungslinks gelten 7 Tage. Bitte um einen neuen Link.",
    statusRevokedTitle: "Dieser Link ist nicht mehr aktiv",
    statusRevokedBody: "Die Einladung wurde zurückgezogen.",
    statusUnavailableTitle: "Dieser Plan wurde abgesagt",
    statusUnavailableBody: "Er findet nicht mehr statt — vielleicht plant ihr gemeinsam etwas Neues?",
    statusNotFoundTitle: "Plan nicht gefunden",
    statusNotFoundBody: "Prüfe, ob der Link vollständig ist, oder bitte um einen neuen Link.",
    statusErrorTitle: "Etwas ist schiefgelaufen",
    statusErrorBody: "Bitte versuch es gleich noch einmal.",
    ogDescriptionWithWhen: "{{when}} · Bist du dabei? Antwort mit einem Tipp — ohne App.",
    ogDescription: "Bist du dabei? Antwort mit einem Tipp — ohne App.",
    tagline: "Winkly — dein KI-Planer für echte Pläne und Begegnungen.",
  },
};

export const SUPPORTED_LANGS = Object.keys(PLAN_PAGE_STRINGS);

/** Best supported language for an Accept-Language header ("de-DE,de;q=0.9,en;q=0.8" → "de"). */
export function pickLang(acceptLanguage) {
  if (typeof acceptLanguage !== "string" || !acceptLanguage.trim()) return "en";
  const ranked = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q ? Number.parseFloat(q.slice(2)) : 1;
      return { base: tag.trim().toLowerCase().split("-")[0], quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((x) => x.base && x.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  return ranked.find((x) => SUPPORTED_LANGS.includes(x.base))?.base ?? "en";
}

/** Look up a string and fill {{placeholders}}. Missing keys fall back to English. */
export function tr(lang, key, vars = {}) {
  const table = PLAN_PAGE_STRINGS[lang] ?? PLAN_PAGE_STRINGS.en;
  const template = table[key] ?? PLAN_PAGE_STRINGS.en[key] ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => (vars[name] ?? "").toString());
}
