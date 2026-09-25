import en from "@/lib/i18n/locales/en.json";
import { catalogTextKey, catalogTexts, translateCatalogText } from "@/lib/ai/conciergeCatalogI18n";

const EN = en as Record<string, string>;

describe("catalogTextKey", () => {
  it("slugs English text into a flat concierge.catalog key", () => {
    expect(catalogTextKey("Theatre / show")).toBe("concierge.catalog.theatre_show");
    expect(catalogTextKey("Dinner & drinks")).toBe("concierge.catalog.dinner_and_drinks");
    expect(catalogTextKey("Board-game café")).toBe("concierge.catalog.board_game_cafe");
  });
});

describe("translateCatalogText", () => {
  const t = (key: string, opts?: { defaultValue?: string }) =>
    key === "concierge.catalog.cinema" ? "Kino" : opts?.defaultValue ?? key;

  it("translates catalogue text and falls back to the text itself", () => {
    expect(translateCatalogText(t, "Cinema")).toBe("Kino");
    expect(translateCatalogText(t, "My own custom plan")).toBe("My own custom plan");
    expect(translateCatalogText(t, null)).toBe("");
  });
});

describe("concierge catalogue coverage", () => {
  const texts = catalogTexts();

  it("has an en.json entry, equal to the English text, for every catalogue text", () => {
    const missing = texts.filter((text) => EN[catalogTextKey(text)] !== text);
    expect(missing).toEqual([]);
  });

  it("never maps two different texts to the same key", () => {
    const byKey = new Map<string, string>();
    const clashes: string[] = [];
    for (const text of texts) {
      const key = catalogTextKey(text);
      const prev = byKey.get(key);
      if (prev && prev !== text) clashes.push(`${prev} | ${text}`);
      byKey.set(key, text);
    }
    expect(clashes).toEqual([]);
  });
});
