/**
 * Translation providers for translate-i18n.mjs. Every provider implements:
 *
 *   {
 *     name: string,            // "anthropic" | "deepl" | "mock"
 *     cacheId: string,         // provider + model; part of the cache key
 *     batchSize: number,       // items per request
 *     translate(items, ctx): Promise<Record<id, string>>
 *   }
 *
 *   item = { id, key, source, previous?, plural?: { category, examples, one, other, existing } }
 *   ctx  = { locale, glossary, retryErrors?: Record<id, string[]> }
 *
 * Items missing from the result count as failed; the caller validates every returned text.
 * Keys come from the environment (or apps/mobile/.env.translate, git-ignored) — never commit them.
 */
import Anthropic from "@anthropic-ai/sdk";
import translate from "./i18nTranslate.js";

const { protectForDeepl, restoreFromDeepl, restoreCount, sampleNumber, glossaryRules } = translate;

export function createProvider(name, env = process.env) {
  if (name === "anthropic") return anthropicProvider(env);
  if (name === "deepl") return deeplProvider(env);
  if (name === "mock") return mockProvider();
  throw new Error(`Unknown provider "${name}" (anthropic, deepl, mock)`);
}

/** anthropic if ANTHROPIC_API_KEY is set, else deepl if DEEPL_API_KEY is set, else null. */
export function defaultProviderName(env = process.env) {
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.DEEPL_API_KEY) return "deepl";
  return null;
}

// ─── Shared prompt material ────────────────────────────────────────────────────

function localeGuide(locale, glossary) {
  const tone = glossary.tone?.[locale] ?? {};
  const language = tone.language ?? locale;
  const terms = Object.entries(glossary.terms ?? {})
    .filter(([, t]) => t[locale])
    .map(([en, t]) => `- "${en}" → "${t[locale]}"${t.note ? ` (${t.note})` : ""}`);
  const dnt = (glossary.doNotTranslate ?? []).map((t) => {
    const note = glossary.doNotTranslateNotes?.[t];
    return `- ${t}${note ? ` — ${note}` : ""}`;
  });
  return { language, tone, terms, dnt };
}

/** English words `item` must keep (glossary.keepEnglishInKeys). */
function keepEnglish(glossary, item) {
  return glossaryRules(glossary, item.key).keepEnglish;
}

// ─── Anthropic (Claude) ────────────────────────────────────────────────────────

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    translations: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, text: { type: "string" } },
        required: ["id", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["translations"],
  additionalProperties: false,
};

function anthropicSystemPrompt(locale, glossary) {
  const { language, tone, terms, dnt } = localeGuide(locale, glossary);
  return [
    `You translate the user interface of a mobile app from English into ${language} (locale code "${locale}").`,
    "",
    `About the app: ${glossary.product ?? ""}`,
    "",
    `Tone: ${glossary.tone?._default ?? ""} Address the user as: ${tone.address ?? "the informal form"}.`,
    "Write what a native speaker would put in a well-made app: natural, idiomatic, not word-for-word.",
    "",
    "Hard rules (a translation that breaks one is rejected):",
    "- Keep every {{placeholder}} exactly as written, same name, same count; never translate or add one.",
    "- Keep tags like <bold>…</bold>, <terms>…</terms>, <privacy>…</privacy> around the matching words; never add or drop one.",
    "- Keep every emoji and every line break (\\n).",
    "- Never translate these names; write them exactly like this:",
    ...dnt,
    "",
    "Preferred terms (inflect as the grammar needs):",
    ...terms,
    "",
    "Keep buttons, chips, tabs and titles about as short as the English.",
    "",
    'Input: a JSON array of items { id, key, text, previous?, plural? }. "key" hints at where the string appears.',
    '"keep_in_english" lists English words this string must keep in English (Latin letters, local inflection allowed).',
    '"previous" is an older translation made for different English; reuse its wording where it still fits.',
    '"plural" means: write the form for the CLDR plural category given, i.e. the text shown when {{count}} is one',
    "of the example numbers. English one/other forms and the language's existing forms are included for context.",
    'Answer with { "translations": [ { "id", "text" } ] } — one entry per input id, text in the target language.',
  ].join("\n");
}

function anthropicProvider(env) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set (put it in your shell or apps/mobile/.env.translate).");
  const model = env.WINKLY_TRANSLATE_MODEL || "claude-opus-5";
  const client = new Anthropic({
    apiKey,
    baseURL: env.WINKLY_TRANSLATE_BASE_URL || "https://api.anthropic.com",
    maxRetries: 5,
  });

  return {
    name: "anthropic",
    cacheId: `anthropic:${model}`,
    batchSize: 40,
    async translate(items, { locale, glossary, retryErrors = {} }) {
      const payload = items.map((it) => ({
        id: it.id,
        key: it.key,
        text: it.source,
        ...(it.previous ? { previous: it.previous } : {}),
        ...(it.plural
          ? {
              plural: {
                category: it.plural.category,
                example_numbers: it.plural.examples,
                english_one: it.plural.one,
                english_other: it.plural.other,
                existing_forms: it.plural.existing,
              },
            }
          : {}),
        ...(keepEnglish(glossary, it).length ? { keep_in_english: keepEnglish(glossary, it) } : {}),
        ...(retryErrors[it.id] ? { rejected_before_because: retryErrors[it.id] } : {}),
      }));

      const response = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [{ type: "text", text: anthropicSystemPrompt(locale, glossary), cache_control: { type: "ephemeral" } }],
        output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
        messages: [{ role: "user", content: JSON.stringify(payload, null, 1) }],
      });

      if (response.stop_reason === "refusal") {
        throw new Error(`model refused (${response.stop_details?.category ?? "no category"})`);
      }
      if (response.stop_reason === "max_tokens") throw new Error("response hit max_tokens — use a smaller --batch");
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      const parsed = JSON.parse(text);
      return Object.fromEntries(parsed.translations.map((t) => [t.id, t.text]));
    },
  };
}

// ─── DeepL ─────────────────────────────────────────────────────────────────────
//
// DeepL has no notion of our glossary notes or plural categories, so:
//  - placeholders, tags, emoji and never-translate names are wrapped in <x>…</x> (ignore_tags)
//    and line breaks become <lb/>, then restored;
//  - tone via formality=prefer_less where DeepL supports it;
//  - plural forms by translating the English with a real example number of that category
//    ("3 members" for Polish "few") and putting {{count}} back where the number ends up.

const DEEPL_TARGET = { pt: "PT-PT", en: "EN-GB" };

function deeplProvider(env) {
  const apiKey = env.DEEPL_API_KEY;
  if (!apiKey) throw new Error("DEEPL_API_KEY is not set (put it in your shell or apps/mobile/.env.translate).");
  const host = apiKey.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";

  async function call(texts, locale, glossary) {
    const res = await fetch(`${host}/v2/translate`, {
      method: "POST",
      headers: { Authorization: `DeepL-Auth-Key ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: texts,
        source_lang: "EN",
        target_lang: DEEPL_TARGET[locale] ?? locale.toUpperCase(),
        tag_handling: "xml",
        ignore_tags: ["x"],
        split_sentences: "nonewlines",
        preserve_formatting: true,
        formality: "prefer_less",
        context: glossary.product,
      }),
    });
    if (!res.ok) throw new Error(`DeepL ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data.translations.map((t) => t.text);
  }

  return {
    name: "deepl",
    cacheId: "deepl:v2",
    batchSize: 50,
    async translate(items, { locale, glossary }) {
      const dnt = glossary.doNotTranslate ?? [];
      const protectedWords = (it) => [
        ...dnt,
        ...keepEnglish(glossary, it).flatMap((w) => [w, `${w}es`, `${w}s`].flatMap((v) => [v, v[0].toUpperCase() + v.slice(1)])),
      ];
      const prepared = items.map((it) => {
        if (!it.plural || !it.source.includes("{{count}}")) return { it, text: it.source };
        const n = sampleNumber(it);
        return { it, n, text: it.source.replace(/\{\{\s*count\s*\}\}/g, String(n)) };
      });
      const out = await call(prepared.map((p) => protectForDeepl(p.text, protectedWords(p.it))), locale, glossary);
      const result = {};
      prepared.forEach((p, i) => {
        let text = restoreFromDeepl(out[i]);
        if (p.n !== undefined) text = restoreCount(text, p.n);
        if (text !== null) result[p.it.id] = text;
      });
      return result;
    },
  };
}

// ─── Mock (tests, --dry-run style trial runs) ─────────────────────────────────

/** Deterministic fake: "[de] Hello {{name}}" — keeps every token, so validation passes. */
function mockProvider() {
  return {
    name: "mock",
    cacheId: "mock",
    batchSize: 100,
    async translate(items, { locale }) {
      return Object.fromEntries(
        items.map((it) => [it.id, `[${locale}${it.plural ? `:${it.plural.category}` : ""}] ${it.source}`])
      );
    },
  };
}
