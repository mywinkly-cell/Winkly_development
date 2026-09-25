import { parseDescribePhrase } from "@/lib/ai/describePhrase";

// Wednesday 2026-09-23 → this Saturday 26th, next Saturday Oct 3rd, next week's Monday 28th.
const NOW = new Date(2026, 8, 23, 14, 0, 0);
const ymd = (d?: Date) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : undefined;

describe("parseDescribePhrase", () => {
  it("parses the English example", () => {
    const r = parseDescribePhrase("Dinner for two this Saturday under 50 euros", NOW);
    expect(ymd(r.date)).toBe("2026-09-26");
    expect(r.budgetAmount).toBe("50");
    expect(r.budgetCurrency).toBe("EUR");
    expect(r.prompt).toBe("Dinner for two");
  });

  it.each([
    ["Abendessen zu zweit diesen Samstag unter 50 Euro", "2026-09-26", "Abendessen zu zweit"],
    ["Dîner à deux ce samedi moins de 50 euros", "2026-09-26", "Dîner à deux"],
    ["Cena para dos este sábado por menos de 50 euros", "2026-09-26", "Cena para dos"],
    ["Cena per due questo sabato sotto 50 euro", "2026-09-26", "Cena per due"],
    ["Kolacja dla dwojga w tę sobotę do 50 euro", "2026-09-26", "Kolacja dla dwojga"],
    ["Вечеря на двох цієї суботи до 50 євро", "2026-09-26", "Вечеря на двох"],
    ["Diner voor twee deze zaterdag onder 50 euro", "2026-09-26", "Diner voor twee"],
    ["Jantar a dois este sábado até 50 euros", "2026-09-26", "Jantar a dois"],
  ])("parses tier-1 phrasing: %s", (text, date, prompt) => {
    const r = parseDescribePhrase(text, NOW);
    expect(ymd(r.date)).toBe(date);
    expect(r.budgetAmount).toBe("50");
    expect(r.budgetCurrency).toBe("EUR");
    expect(r.prompt).toBe(prompt);
  });

  it("prefers 'next Saturday' over 'Saturday'", () => {
    expect(ymd(parseDescribePhrase("volgende zaterdag bowlen", NOW).date)).toBe("2026-10-03");
    expect(ymd(parseDescribePhrase("next Saturday brunch", NOW).date)).toBe("2026-10-03");
  });

  it("handles tomorrow and next week in other languages", () => {
    expect(ymd(parseDescribePhrase("Kino morgen", NOW).date)).toBe("2026-09-24");
    expect(ymd(parseDescribePhrase("кава завтра", NOW).date)).toBe("2026-09-24");
    expect(ymd(parseDescribePhrase("golf la semaine prochaine", NOW).date)).toBe("2026-09-28");
  });

  it("does not read 'morning' as 'tomorrow'", () => {
    expect(parseDescribePhrase("un paseo por la mañana", NOW).date).toBeUndefined();
    expect(parseDescribePhrase("Yoga heute Morgen", NOW).date).toBeUndefined();
  });

  it("reads other currencies and a symbol before the amount", () => {
    expect(parseDescribePhrase("lunch max £30", NOW)).toMatchObject({ budgetAmount: "30", budgetCurrency: "GBP" });
    expect(parseDescribePhrase("obiad 80 zł", NOW)).toMatchObject({ budgetAmount: "80", budgetCurrency: "PLN" });
  });

  it("leaves text without dates or budgets as the prompt", () => {
    expect(parseDescribePhrase("Something relaxing", NOW)).toEqual({ prompt: "Something relaxing" });
    expect(parseDescribePhrase("   ", NOW)).toEqual({});
  });
});
