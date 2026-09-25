/**
 * "Say what you want" pre-fill: pulls a date and a budget out of a one-line request such as
 * "Dinner for two this Saturday under 50 euros" / "Abendessen zu zweit diesen Samstag unter 50 Euro",
 * and returns the rest as the prompt. Phrases are recognised in English and the tier-1 languages
 * (de, fr, es, it, pl, uk, nl, pt) regardless of the app language — people type in whatever they speak.
 */

export type DescribePhraseResult = {
  prompt?: string;
  date?: Date;
  budgetAmount?: string;
  budgetCurrency?: string;
};

type DateRule = "this_saturday" | "next_saturday" | "this_weekend" | "tomorrow" | "next_week";

/** Checked in this order; the first rule with a matching phrase wins (like the original English parser). */
const DATE_PHRASES: Record<DateRule, string[]> = {
  this_saturday: [
    "this saturday",
    "diesen samstag", "am samstag", "kommenden samstag",
    "ce samedi", "samedi prochain",
    "este sábado", "este sabado",
    "questo sabato", "sabato prossimo",
    "w tę sobotę", "w te sobote", "w sobotę",
    "цієї суботи", "в суботу", "у суботу",
    "deze zaterdag", "zaterdag",
    "este sábado", "neste sábado", "no sábado",
  ],
  next_saturday: [
    "next saturday",
    "nächsten samstag", "naechsten samstag",
    "samedi de la semaine prochaine",
    "el próximo sábado", "el proximo sabado", "el sábado que viene",
    "il sabato dopo",
    "w przyszłą sobotę", "w przyszla sobote",
    "наступної суботи",
    "volgende zaterdag",
    "no próximo sábado", "próximo sábado",
  ],
  this_weekend: [
    "this weekend",
    "dieses wochenende", "am wochenende",
    "ce week-end", "ce weekend",
    "este fin de semana",
    "questo weekend", "questo fine settimana",
    "w ten weekend", "w weekend",
    "цими вихідними", "на вихідних",
    "dit weekend",
    "este fim de semana", "neste fim de semana",
  ],
  tomorrow: ["tomorrow", "morgen", "demain", "mañana", "manana", "domani", "jutro", "завтра", "amanhã", "amanha"],
  next_week: [
    "next week",
    "nächste woche", "naechste woche",
    "la semaine prochaine",
    "la próxima semana", "la proxima semana", "la semana que viene",
    "la prossima settimana", "settimana prossima",
    "w przyszłym tygodniu", "w przyszlym tygodniu",
    "наступного тижня",
    "volgende week",
    "na próxima semana", "próxima semana",
  ],
};

/** "mañana" / "Morgen" also mean "morning": "por la mañana", "heute Morgen", "am Morgen" are not "tomorrow". */
const MORNING_CONTEXT = /(?:^|\s)(?:la|esta|heute|am|guten|jeden|morgens|de|op)\s*$/iu;

/** Words meaning "under / at most" before an amount. */
const BUDGET_PREFIXES = [
  "under", "below", "max", "up to",
  "unter", "bis", "höchstens",
  "moins de", "sous", "jusqu'à",
  "por menos de", "menos de", "hasta", "máximo",
  "meno di", "sotto", "fino a", "massimo",
  "poniżej", "do", "maks",
  "до", "менше ніж", "максимум",
  "onder", "tot", "maximaal",
  "até", "abaixo de", "no máximo",
];

const CURRENCIES: { code: string; words: string[] }[] = [
  { code: "EUR", words: ["euros", "euro", "eur", "€", "евро", "євро"] },
  { code: "USD", words: ["dollars", "dollar", "usd", "$", "dólares", "dolares", "dollari", "dolarów", "доларів"] },
  { code: "GBP", words: ["pounds", "pound", "gbp", "£", "pfund", "livres", "libras", "sterline", "funtów", "фунтів"] },
  { code: "CHF", words: ["chf", "franken", "francs"] },
  { code: "PLN", words: ["pln", "zł", "zl", "złotych", "zlotych", "zloty"] },
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-phrase match that also works for non-Latin scripts (\b is ASCII-only in JS). */
function phraseRegex(phrases: string[], flags = "iu"): RegExp {
  const alts = [...phrases].sort((a, b) => b.length - a.length).map(escape).join("|");
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, flags);
}

const CURRENCY_ALT = CURRENCIES.flatMap((c) => c.words)
  .sort((a, b) => b.length - a.length)
  .map(escape)
  .join("|");
const PREFIX_ALT = [...BUDGET_PREFIXES].sort((a, b) => b.length - a.length).map(escape).join("|");
const AMOUNT = "(\\d+(?:[.,]\\d{1,2})?)";
const CURRENCY_GROUP = `(${CURRENCY_ALT})`;
const WORD_END = "(?![\\p{L}])";

/** "under 50 euros", "unter 50 €", "max €50", "50 zł". */
const BUDGET_PATTERNS: RegExp[] = [
  new RegExp(`(?<![\\p{L}])(?:${PREFIX_ALT})\\s*${AMOUNT}\\s*${CURRENCY_GROUP}${WORD_END}`, "iu"),
  new RegExp(`(?<![\\p{L}])(?:${PREFIX_ALT})\\s*${CURRENCY_GROUP}\\s*${AMOUNT}`, "iu"),
  new RegExp(`${AMOUNT}\\s*${CURRENCY_GROUP}${WORD_END}`, "iu"),
  new RegExp(`${CURRENCY_GROUP}\\s*${AMOUNT}`, "iu"),
];

function currencyCode(word: string): string {
  const w = word.toLowerCase();
  return CURRENCIES.find((c) => c.words.includes(w))?.code ?? "EUR";
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Next Saturday (today if it's Saturday). */
function nextSaturday(today: Date): Date {
  const x = startOfDay(today);
  const day = x.getDay();
  x.setDate(x.getDate() + (day === 6 ? 0 : day === 0 ? 6 : 6 - day));
  return x;
}

/** Monday of the week containing `d`. */
function mondayOf(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
  return x;
}

function dateFor(rule: DateRule, today: Date): Date {
  switch (rule) {
    case "this_saturday":
    case "this_weekend":
      return nextSaturday(today);
    case "next_saturday": {
      const d = nextSaturday(today);
      d.setDate(d.getDate() + 7);
      return d;
    }
    case "tomorrow": {
      const d = startOfDay(today);
      d.setDate(d.getDate() + 1);
      return d;
    }
    case "next_week": {
      const d = mondayOf(today);
      d.setDate(d.getDate() + 7);
      return d;
    }
  }
}

const tidy = (s: string) => s.replace(/\s+/g, " ").replace(/\s+([,.!?])/g, "$1").trim();

export function parseDescribePhrase(text: string, now: Date = new Date()): DescribePhraseResult {
  const t = text.trim();
  if (!t) return {};
  const out: DescribePhraseResult = {};
  let rest = t;

  for (const pattern of BUDGET_PATTERNS) {
    const m = pattern.exec(rest);
    if (!m) continue;
    const [amount, currency] = /\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
    out.budgetAmount = amount.replace(",", ".");
    out.budgetCurrency = currencyCode(currency);
    rest = tidy(rest.replace(m[0], " "));
    break;
  }

  // Longer, more specific phrases first ("next saturday" before "saturday").
  const order: DateRule[] = ["next_saturday", "this_saturday", "this_weekend", "next_week", "tomorrow"];
  for (const rule of order) {
    const re = phraseRegex(DATE_PHRASES[rule]);
    const m = re.exec(rest);
    if (m && rule === "tomorrow" && MORNING_CONTEXT.test(rest.slice(0, m.index))) continue;
    if (m) {
      out.date = dateFor(rule, now);
      rest = tidy(rest.replace(phraseRegex(DATE_PHRASES[rule], "giu"), " "));
      break;
    }
  }

  if (rest.length > 0) out.prompt = rest;
  return out;
}
