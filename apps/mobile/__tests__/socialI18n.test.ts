import { createInstance } from "i18next";
import en from "@/lib/i18n/locales/en.json";
import de from "@/lib/i18n/locales/de.json";
import fr from "@/lib/i18n/locales/fr.json";
import es from "@/lib/i18n/locales/es.json";
import itStrings from "@/lib/i18n/locales/it.json";
import pl from "@/lib/i18n/locales/pl.json";
import uk from "@/lib/i18n/locales/uk.json";
import nl from "@/lib/i18n/locales/nl.json";
import pt from "@/lib/i18n/locales/pt.json";
import coverageConfig from "@/lib/i18n/coverage-config.json";
import { isAllowlisted } from "../scripts/lib/i18nCoverage";

type Strings = Record<string, string>;
const enStrings = en as Strings;
const TIER1: Record<string, Strings> = { de, fr, es, it: itStrings, pl, uk, nl, pt };

/** Chats, groups and notifications UI (plus the photo-moderation strings shown in chat). */
const SOCIAL = /^(chat|groups|notifications|moderation)\./;
/** In en.json under these prefixes but not referenced by any screen — nothing to translate. */
const UNUSED = new Set(["chat.recordingTooShort", "chat.typeMessage", "chat.noChats", "groups.groupDetails"]);
const socialKeys = Object.keys(enStrings).filter((k) => SOCIAL.test(k) && !UNUSED.has(k));

describe("social UI translations", () => {
  it.each(Object.keys(TIER1))("%s has no English left in chats, groups or notifications", (lang) => {
    const strings = TIER1[lang];
    const english = socialKeys.filter(
      (k) => strings[k] === enStrings[k] && !isAllowlisted(k, enStrings[k], lang, coverageConfig.allowlist)
    );
    expect(english).toEqual([]);
  });

  it.each(["pl", "uk"])("%s has _few and _many for every chat/group plural", (lang) => {
    const strings = TIER1[lang];
    const bases = socialKeys.filter((k) => k.endsWith("_other")).map((k) => k.slice(0, -"_other".length));
    const missing = bases.filter((b) => !strings[`${b}_few`] || !strings[`${b}_many`]);
    expect(missing).toEqual([]);
  });
});

describe("pl/uk plural rendering", () => {
  const i18n = createInstance();

  beforeAll(async () => {
    await i18n.init({
      lng: "pl",
      fallbackLng: false,
      keySeparator: false,
      interpolation: { escapeValue: false },
      resources: { pl: { translation: pl }, uk: { translation: uk } },
    });
  });

  it("picks the Polish form for 1, 3 and 5", async () => {
    await i18n.changeLanguage("pl");
    expect(i18n.t("groups.invite.inviteN", { count: 1 })).toBe("Zaproś 1 osobę");
    expect(i18n.t("groups.invite.inviteN", { count: 3 })).toBe("Zaproś 3 osoby");
    expect(i18n.t("groups.invite.inviteN", { count: 5 })).toBe("Zaproś 5 osób");
  });

  it("picks the Ukrainian form for 1, 3, 5 and 21", async () => {
    await i18n.changeLanguage("uk");
    const t = (count: number) => i18n.t("chat.matchContext.sharedInterests", { count });
    expect(t(1)).toBe("1 спільний інтерес");
    expect(t(3)).toBe("3 спільні інтереси");
    expect(t(5)).toBe("5 спільних інтересів");
    expect(t(21)).toBe("21 спільний інтерес");
  });
});
