import { changeLanguage, init } from "i18next";
import en from "@/lib/i18n/locales/en.json";
import de from "@/lib/i18n/locales/de.json";
import { formatChatInboxTimestamp } from "@/lib/chats/inbox";
import authOnboarding from "@/lib/i18n/patches/auth-onboarding.json";
import surprise from "@/lib/i18n/patches/surprise.json";
import socialDe from "@/lib/i18n/patches/social-de.json";
import socialEs from "@/lib/i18n/patches/social-es.json";
import socialFr from "@/lib/i18n/patches/social-fr.json";
import socialIt from "@/lib/i18n/patches/social-it.json";
import socialNl from "@/lib/i18n/patches/social-nl.json";
import socialPl from "@/lib/i18n/patches/social-pl.json";
import socialPt from "@/lib/i18n/patches/social-pt.json";
import socialUk from "@/lib/i18n/patches/social-uk.json";
import accountPaywallErrors from "@/lib/i18n/patches/account-paywall-errors.json";
import plannerConcierge from "@/lib/i18n/patches/planner-concierge.json";

type Patch = Record<string, Record<string, string>>;
const PATCHES: Record<string, Patch> = {
  "auth-onboarding": authOnboarding,
  surprise,
  "social-de": socialDe,
  "social-es": socialEs,
  "social-fr": socialFr,
  "social-it": socialIt,
  "social-nl": socialNl,
  "social-pl": socialPl,
  "social-pt": socialPt,
  "social-uk": socialUk,
  "account-paywall-errors": accountPaywallErrors,
  "planner-concierge": plannerConcierge,
};

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

beforeAll(async () => {
  await init({
    lng: "en",
    fallbackLng: false,
    keySeparator: false,
    interpolation: { escapeValue: false },
    resources: { en: { translation: en }, de: { translation: de } },
  });
});

describe("formatChatInboxTimestamp", () => {
  afterEach(() => changeLanguage("en"));

  it("uses translated relative units", () => {
    expect(formatChatInboxTimestamp(minutesAgo(0))).toBe("Now");
    expect(formatChatInboxTimestamp(minutesAgo(5))).toBe("5m");
    expect(formatChatInboxTimestamp(minutesAgo(3 * 60))).toBe("3h");
    expect(formatChatInboxTimestamp(minutesAgo(3 * 24 * 60))).toBe("3d");
  });

  it("follows the app language", async () => {
    await changeLanguage("de");
    expect(formatChatInboxTimestamp(minutesAgo(5))).toBe("5 Min.");
    expect(formatChatInboxTimestamp(minutesAgo(3 * 60))).toBe("3 Std.");
  });

  it("shows a dash when there is no timestamp", () => {
    expect(formatChatInboxTimestamp(null)).toBe("—");
  });
});

describe("translation patches", () => {
  const tokens = (s: string) => (s.match(/\{\{\w+\}\}|<\/?\w+>/g) ?? []).sort();
  const enStrings = en as Record<string, string>;

  for (const [name, data] of Object.entries(PATCHES)) {
    it(`${name} keeps every English placeholder and tag`, () => {
      for (const [locale, keys] of Object.entries(data)) {
        for (const [key, value] of Object.entries(keys)) {
          const english = enStrings[key];
          if (english == null) continue;
          expect({ locale, key, tokens: tokens(value) }).toEqual({ locale, key, tokens: tokens(english) });
        }
      }
    });
  }
});
