/**
 * Locale-aware formatters (money, dates, times) and the default currency for a place.
 * Always pass the app locale (getAppLocaleTag / useAppLocaleTag), never undefined — the device
 * locale can differ from the language the user picked in Winkly. See docs/I18N.md.
 */

import { getLocales } from "expo-localization";
import { getAppLocaleTag } from "@/lib/i18n/appLocale";

/** ISO 3166 region → currency, for the markets Winkly ships in (anything else in the EU → EUR). */
const REGION_CURRENCY: Record<string, string> = {
  GB: "GBP", IE: "EUR", CH: "CHF", LI: "CHF", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", BG: "BGN",
  SE: "SEK", DK: "DKK", NO: "NOK", IS: "ISK", UA: "UAH", US: "USD", CA: "CAD", AU: "AUD",
};

/** Country names as they appear in "City, Country" lines (English + common local spellings). */
const COUNTRY_NAME_REGION: Record<string, string> = {
  "united kingdom": "GB", uk: "GB", england: "GB", scotland: "GB", wales: "GB", "great britain": "GB",
  switzerland: "CH", schweiz: "CH", suisse: "CH", svizzera: "CH", liechtenstein: "LI",
  poland: "PL", polska: "PL", "czech republic": "CZ", czechia: "CZ", česko: "CZ", hungary: "HU", magyarország: "HU",
  romania: "RO", românia: "RO", bulgaria: "BG", sweden: "SE", sverige: "SE", denmark: "DK", danmark: "DK",
  norway: "NO", norge: "NO", iceland: "IS", ukraine: "UA", україна: "UA", "united states": "US", usa: "US",
  canada: "CA", australia: "AU",
  // Eurozone (region codes aren't in REGION_CURRENCY, so they resolve to EUR)
  germany: "DE", deutschland: "DE", austria: "AT", österreich: "AT", france: "FR", belgium: "BE", belgië: "BE",
  belgique: "BE", netherlands: "NL", nederland: "NL", luxembourg: "LU", italy: "IT", italia: "IT", spain: "ES",
  españa: "ES", portugal: "PT", ireland: "IE", finland: "FI", suomi: "FI", greece: "GR", ελλάδα: "GR",
  slovakia: "SK", slovensko: "SK", slovenia: "SI", slovenija: "SI", estonia: "EE", eesti: "EE", latvia: "LV",
  latvija: "LV", lithuania: "LT", lietuva: "LT", croatia: "HR", hrvatska: "HR", malta: "MT", cyprus: "CY",
};

/** City (lowercase) → currency, for when the line has no country. */
const CITY_CURRENCY: Record<string, string> = {
  london: "GBP", manchester: "GBP", edinburgh: "GBP", "new york": "USD", "los angeles": "USD", chicago: "USD",
  miami: "USD", boston: "USD", zurich: "CHF", zürich: "CHF", geneva: "CHF", genève: "CHF", bern: "CHF", basel: "CHF",
  warsaw: "PLN", warszawa: "PLN", krakow: "PLN", kraków: "PLN", wrocław: "PLN", gdańsk: "PLN",
  prague: "CZK", praha: "CZK", budapest: "HUF", bucharest: "RON", bucurești: "RON", sofia: "BGN",
  oslo: "NOK", stockholm: "SEK", copenhagen: "DKK", københavn: "DKK", reykjavik: "ISK", kyiv: "UAH", київ: "UAH",
  lviv: "UAH", львів: "UAH",
};

/** Currency for a "City, Country" line or ISO region code; undefined when it can't tell. */
export function currencyForPlace(place: string | null | undefined): string | undefined {
  if (!place) return undefined;
  const parts = place.split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return undefined;
  const last = parts[parts.length - 1];
  if (parts.length > 1 || /^[A-Za-z]{2}$/.test(last)) {
    const region = /^[A-Za-z]{2}$/.test(last) ? last.toUpperCase() : COUNTRY_NAME_REGION[last.toLowerCase()];
    if (region) return REGION_CURRENCY[region] ?? "EUR";
  }
  return CITY_CURRENCY[parts[0].toLowerCase()];
}

/** Currency for a device region code (e.g. "PL"), EUR when unknown. */
export function currencyForRegion(region: string | null | undefined): string {
  return (region && REGION_CURRENCY[region.toUpperCase()]) || "EUR";
}

function deviceRegion(): string | null {
  try {
    return getLocales()[0]?.regionCode ?? null;
  } catch {
    return null;
  }
}

/** Default budget currency: the planned place first, then the device region, then EUR. */
export function defaultCurrency(place?: string | null): string {
  return currencyForPlace(place) ?? currencyForRegion(deviceRegion());
}

/** "€50", "50 €", "50 zł", "CHF 50" — per locale; whole amounts without decimals. */
export function formatMoney(
  amount: number | string,
  currency: string,
  locale: string = getAppLocaleTag()
): string {
  const n = typeof amount === "number" ? amount : Number(String(amount).replace(",", "."));
  if (!Number.isFinite(n)) return `${amount} ${currency}`;
  const whole = Number.isInteger(n);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(n);
  } catch {
    return `${n} ${currency}`;
  }
}

/** Short day + month, e.g. "26 Sept" / "26. Sept." / "Sep 26". */
export function formatShortDate(date: Date, locale: string = getAppLocaleTag()): string {
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

/** Weekday + day + month (+ year when it isn't this year). */
export function formatDayDate(date: Date, locale: string = getAppLocaleTag(), now: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}),
  });
}

/** Clock time in the locale's style (24h in most of Europe, 12h in en-US). */
export function formatClockTime(date: Date, locale: string = getAppLocaleTag()): string {
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}
