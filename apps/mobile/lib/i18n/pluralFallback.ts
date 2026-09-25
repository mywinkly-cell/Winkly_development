/**
 * Locale files only have to carry English's plural forms (`key_one` / `key_other`).
 * Languages with more categories (pl, uk, cs: `_few` / `_many`; ar: `_zero` / `_two`)
 * would otherwise render the raw key for e.g. count = 3. Fill every category the
 * language needs but lacks from `_other`, so a missing form degrades to a
 * slightly-off plural instead of `account.invite.matches`.
 */

const CATEGORIES = ["zero", "one", "two", "few", "many", "other"] as const;

export function pluralCategoriesFor(language: string): string[] {
  try {
    return new Intl.PluralRules(language).resolvedOptions().pluralCategories;
  } catch {
    return ["one", "other"];
  }
}

export function fillMissingPluralForms(
  bundle: Record<string, string>,
  categories: readonly string[]
): Record<string, string> {
  const out = { ...bundle };
  for (const key of Object.keys(bundle)) {
    if (!key.endsWith("_other")) continue;
    const base = key.slice(0, -"_other".length);
    for (const cat of categories) {
      if (!(CATEGORIES as readonly string[]).includes(cat)) continue;
      const k = `${base}_${cat}`;
      if (!(k in out)) out[k] = bundle[key];
    }
  }
  return out;
}
