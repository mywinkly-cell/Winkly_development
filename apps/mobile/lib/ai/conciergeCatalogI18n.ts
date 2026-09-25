/**
 * i18n for the concierge activity catalogue (lib/ai/conciergePlanningFlow.ts).
 *
 * The catalogue's English labels double as stable values: they're sent to the AI as the plan
 * theme, stored on planner items and used as lookup keys (e.g. FOOD_AND_DRINKS_FORMAT_PROMPTS).
 * So the data stays English and only the display is translated: every catalogue text maps to
 * a flat key `concierge.catalog.<slug>` derived from the English itself. Text that isn't in the
 * catalogue (a user-typed custom label) falls back to itself.
 */

import {
  ALL_ACTIVITY_CATEGORIES,
  FOOD_AND_DRINKS_FORMAT_PROMPTS,
  INLINE_HINT_TEXTS,
  INTENT_SECTION_LABELS,
  MODE_CARDS,
  PLANNER_GROUPS,
  SUB_ACTIVITY_META,
} from "@/lib/ai/conciergePlanningFlow";

const PREFIX = "concierge.catalog.";

/** "Theatre / show" → "concierge.catalog.theatre_show". */
export function catalogTextKey(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return PREFIX + (slug || "empty");
}

type TranslateFn = (key: string, options?: { defaultValue?: string }) => string;

/** Display a catalogue text in the app language; unknown text (e.g. a custom label) is returned as-is. */
export function translateCatalogText(t: TranslateFn, text: string | null | undefined): string {
  if (!text) return "";
  return t(catalogTextKey(text), { defaultValue: text });
}

/** Every user-facing catalogue text, de-duplicated (source for en.json and the coverage test). */
export function catalogTexts(): string[] {
  const out = new Set<string>();
  const add = (s: string | undefined) => {
    if (s && s.trim()) out.add(s);
  };
  for (const c of ALL_ACTIVITY_CATEGORIES) {
    add(c.label);
    add(c.subActivityPrompt);
    c.subActivities.forEach(add);
  }
  for (const g of PLANNER_GROUPS) {
    add(g.label);
    for (const card of g.cards) {
      add(card.label);
      add(card.sub);
    }
  }
  for (const cards of Object.values(MODE_CARDS)) {
    for (const card of cards) {
      add(card.label);
      add(card.sub);
    }
  }
  Object.keys(FOOD_AND_DRINKS_FORMAT_PROMPTS).forEach(add);
  Object.values(FOOD_AND_DRINKS_FORMAT_PROMPTS).forEach(add);
  INTENT_SECTION_LABELS.forEach(add);
  INLINE_HINT_TEXTS.forEach(add);
  for (const [label, meta] of Object.entries(SUB_ACTIVITY_META)) {
    add(label);
    add(meta.hint);
  }
  return [...out];
}
