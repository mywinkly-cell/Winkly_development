/**
 * Normalize country strings for display and geocoding so they match Open-Meteo
 * autocomplete ("City, Country" with full country names, localized by language).
 * Expands ISO 3166-1 alpha-2 (DE, UA), common abbreviations (UK→GB, USA→US, UAE→AE),
 * and a subset of alpha-3 codes (UKR→UA) via Intl.DisplayNames where possible.
 */

/** True if the string is exactly two letters (case-insensitive), treated as ISO alpha-2. */
function isIso3166Alpha2(s: string): boolean {
  return /^[A-Za-z]{2}$/.test(s.trim());
}

/** True if the string is exactly three ASCII letters (alpha-3 or abbrev). */
function isThreeLetterToken(s: string): boolean {
  return /^[A-Za-z]{3}$/.test(s.trim());
}

/** Collapse for alias lookup: "U.S.A." / "u k" → "USA" / "UK". */
function countryLookupKey(raw: string): string {
  return raw
    .trim()
    .replace(/\./g, "")
    .replace(/[\s-]+/g, "")
    .toUpperCase();
}

/**
 * Colloquial or non-standard tokens → ISO 3166-1 alpha-2 (UK is not a valid region code in Intl; GB is).
 */
const COLLOQUIAL_COUNTRY_TO_ALPHA2: Record<string, string> = {
  UK: "GB",
  USA: "US",
  UAE: "AE",
};

/**
 * ISO 3166-1 alpha-3 → alpha-2 (common locales; avoids bundling full tables).
 * @see https://en.wikipedia.org/wiki/ISO_3166-1_alpha-3
 */
const ISO_ALPHA3_TO_ALPHA2: Record<string, string> = {
  UKR: "UA",
  DEU: "DE",
  FRA: "FR",
  ITA: "IT",
  ESP: "ES",
  NLD: "NL",
  BEL: "BE",
  AUT: "AT",
  CHE: "CH",
  POL: "PL",
  CZE: "CZ",
  SWE: "SE",
  NOR: "NO",
  DNK: "DK",
  FIN: "FI",
  GRC: "GR",
  PRT: "PT",
  IRL: "IE",
  HUN: "HU",
  ROU: "RO",
  BGR: "BG",
  HRV: "HR",
  SVK: "SK",
  SVN: "SI",
  LTU: "LT",
  LVA: "LV",
  EST: "EE",
  RUS: "RU",
  BLR: "BY",
  MDA: "MD",
  SRB: "RS",
  BIH: "BA",
  MKD: "MK",
  ALB: "AL",
  MLT: "MT",
  CYP: "CY",
  ISL: "IS",
  LUX: "LU",
  AUS: "AU",
  NZL: "NZ",
  CAN: "CA",
  MEX: "MX",
  BRA: "BR",
  ARG: "AR",
  CHL: "CL",
  COL: "CO",
  JPN: "JP",
  KOR: "KR",
  CHN: "CN",
  IND: "IN",
  IDN: "ID",
  THA: "TH",
  VNM: "VN",
  PHL: "PH",
  MYS: "MY",
  SGP: "SG",
  ZAF: "ZA",
  EGY: "EG",
  ISR: "IL",
  TUR: "TR",
  SAU: "SA",
  ARE: "AE",
  QAT: "QA",
  KWT: "KW",
  PAK: "PK",
  BGD: "BD",
  NGA: "NG",
  KEN: "KE",
  MAR: "MA",
  DZA: "DZ",
  TUN: "TN",
};

function resolveIsoAlpha2(country: string): string | null {
  const t = country.trim();
  const key = countryLookupKey(t);
  if (!key) return null;
  const fromColloquial = COLLOQUIAL_COUNTRY_TO_ALPHA2[key];
  if (fromColloquial) return fromColloquial;
  if (isIso3166Alpha2(t)) return key;
  if (isThreeLetterToken(t) && ISO_ALPHA3_TO_ALPHA2[key]) return ISO_ALPHA3_TO_ALPHA2[key];
  return null;
}

/** Full ISO 3166-1 alpha-2 list (249 codes) — fallback when `Intl.supportedValuesOf('region')` is unavailable. */
const ISO_3166_1_ALPHA2_CODES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(/\s+/);

function getRegionCodes(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    if (typeof fn === "function") {
      const codes = fn.call(Intl, "region");
      if (Array.isArray(codes)) {
        const two = codes.filter((r): r is string => typeof r === "string" && r.length === 2);
        if (two.length >= 200) return two;
      }
    }
  } catch {
    /* empty */
  }
  return ISO_3166_1_ALPHA2_CODES;
}

/**
 * Locales used to match OSM/Nominatim/expo strings like "Deutschland" or "France" to a region code.
 * Must cover app languages in `lib/i18n` plus common variants.
 */
const LOCALES_FOR_COUNTRY_NAME_MATCH = [
  "en", "en-US", "en-GB",
  "de", "de-DE", "de-AT", "de-CH",
  "fr", "fr-FR",
  "es", "es-ES", "es-MX",
  "it", "it-IT",
  "nl", "nl-NL",
  "pl", "pl-PL",
  "pt", "pt-PT", "pt-BR",
  "ru", "ru-RU",
  "uk", "uk-UA",
  "cs", "sv", "da", "fi", "el", "ro", "hu", "sk", "bg", "hr", "sl", "et", "lv", "lt", "mt", "ga",
  "ja", "ko", "zh-CN", "zh-TW",
];

let reverseCountryNameToCode: Map<string, string> | null = null;

function getReverseCountryNameMap(): Map<string, string> {
  if (reverseCountryNameToCode) return reverseCountryNameToCode;
  const map = new Map<string, string>();
  const codes = getRegionCodes();
  for (const code of codes) {
    for (const loc of LOCALES_FOR_COUNTRY_NAME_MATCH) {
      try {
        const dn = new Intl.DisplayNames([loc], { type: "region" });
        const display = dn.of(code);
        if (display) {
          const key = display.toLowerCase().normalize("NFC");
          if (!map.has(key)) map.set(key, code);
        }
      } catch {
        /* invalid locale on some engines */
      }
    }
  }
  reverseCountryNameToCode = map;
  return map;
}

/** Map a full country name in any supported locale (e.g. "Deutschland", "Germany") to ISO alpha-2. */
function resolveFullCountryNameToAlpha2(country: string): string | null {
  const t = country.trim();
  if (!t) return null;
  const key = t.toLowerCase().normalize("NFC");
  return getReverseCountryNameMap().get(key) ?? null;
}

function regionDisplayName(alpha2: string, language: string): string {
  try {
    const dn = new Intl.DisplayNames([language, "en"], { type: "region" });
    return dn.of(alpha2) ?? alpha2;
  } catch {
    try {
      return new Intl.DisplayNames(["en"], { type: "region" }).of(alpha2) ?? alpha2;
    } catch {
      return alpha2;
    }
  }
}

/**
 * Expand a country segment to the **app language** full name: ISO codes, alpha-3, UK/USA/UAE,
 * and localized names from geocoders/OSM (e.g. "Deutschland" → "Germany" when `language` is English).
 * @param language BCP 47 language tag from `useTranslation().i18n.language`, defaults to "en".
 */
export function expandCountryForDisplay(country: string, language = "en"): string {
  const t = country?.trim();
  if (!t) return "";
  const alpha2 = resolveIsoAlpha2(t) ?? resolveFullCountryNameToAlpha2(t);
  if (!alpha2) return t;
  return regionDisplayName(alpha2, language);
}

/**
 * Build "City, Country" for default location fields, expanding ISO country codes.
 * If `city` already contains a comma (e.g. profiles_core stores "Olching, DE"), treat it as one
 * line and normalize — do not append `country` again (avoids "Olching, DE, Germany").
 */
export function formatDefaultLocationDisplay(
  city: string | null | undefined,
  country: string | null | undefined,
  language = "en"
): string {
  const c = city?.trim() ?? "";
  const co = country?.trim() ? expandCountryForDisplay(country, language) : "";
  if (c.includes(",")) {
    return normalizeLocationDisplayString(c, language);
  }
  if (c && co) return `${c}, ${co}`;
  if (c) return c;
  if (co) return co;
  return "";
}

/**
 * Normalize a full "City, Country" string (e.g. reverse geocode or profile) so the
 * country segment matches autocomplete — expands ISO codes in the segment after the last comma.
 */
export function normalizeLocationDisplayString(loc: string, language = "en"): string {
  const s = loc?.trim() ?? "";
  if (!s) return "";
  const lastComma = s.lastIndexOf(",");
  if (lastComma < 0) return s;
  const city = s.slice(0, lastComma).trim();
  const country = s.slice(lastComma + 1).trim();
  return formatDefaultLocationDisplay(city, country, language);
}

/**
 * Locality (city) part for comparing "same city" when one side is "Olching" and the other "Olching, Germany".
 */
export function localityFromLocationString(loc: string): string {
  const s = loc?.trim() ?? "";
  if (!s) return "";
  const last = s.lastIndexOf(",");
  return last >= 0 ? s.slice(0, last).trim() : s;
}

/** True when both strings refer to the same locality (ignores country formatting differences). */
export function sameLocality(a: string, b: string): boolean {
  return localityFromLocationString(a).toLowerCase() === localityFromLocationString(b).toLowerCase();
}
