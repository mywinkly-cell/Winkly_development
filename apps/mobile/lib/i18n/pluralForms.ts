/**
 * Plural safety net for locale bundles.
 *
 * en.json only has `key_one` / `key_other`. Languages with more plural categories
 * (pl, uk, ru, cs: `_few` / `_many`; ar-style `_two` / `_zero`) need those forms too,
 * and i18next shows the raw key when the form it picks is missing (fallbackLng is off).
 * Until a translator adds the real form (docs/I18N.md), reuse the locale's `_other`
 * text so the user sees a readable sentence instead of "onboarding.subProfile.pets".
 */

const SUFFIX = /^(.+)_other$/;

function pluralCategories(lng: string): string[] {
  try {
    return new Intl.PluralRules(lng).resolvedOptions().pluralCategories as string[];
  } catch {
    return ["one", "other"];
  }
}

/** Returns a copy of `bundle` with any plural form `lng` needs filled from `key_other`. */
export function fillMissingPluralForms(
  bundle: Record<string, string>,
  lng: string
): Record<string, string> {
  const categories = pluralCategories(lng).filter((c) => c !== "other");
  const out = { ...bundle };
  for (const key of Object.keys(bundle)) {
    const match = SUFFIX.exec(key);
    if (!match) continue;
    for (const category of categories) {
      const formKey = `${match[1]}_${category}`;
      if (!(formKey in out)) out[formKey] = bundle[key];
    }
  }
  return out;
}
