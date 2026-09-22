/**
 * Plan-it assumptions — what the AI inferred from a one-line request ("when", "budget",
 * "setting", "area"), shown as editable chips above the results.
 *
 * Pure logic only (no React / network) so it is unit-testable:
 * - parse + validate the gateway's `assumptions` array (never trust model output),
 * - map a chip to the one activity-details field its sheet opens,
 * - turn inferred values into ActivityDetails (for the sheet + "Fine-tune" prefill),
 * - turn user-corrected ("pinned") fields back into winkly_plan context.
 */

import type { ActivityDetails, TimeOfDay } from "@/lib/ai/conciergePlanningFlow";
import { isSameCalendarDay } from "@/lib/ai/planTimeValidation";

export const ASSUMPTION_FIELDS = ["when", "budget", "setting", "area"] as const;
export type AssumptionField = (typeof ASSUMPTION_FIELDS)[number];

/**
 * One inferred assumption. `label` is the model's short, localized chip text; `value` is the
 * machine-readable form:
 * - when:    "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" (local wall clock)
 * - budget:  "<amount> <ISO currency>" per person, e.g. "30 EUR"
 * - setting: "indoor" | "outdoor" | "either"
 * - area:    neighbourhood / district name
 */
export type PlanAssumption = {
  field: AssumptionField;
  label: string;
  value?: string;
};

/** Which section of ConciergeActivityDetailsStep a chip opens (and nothing else). */
export type AssumptionDetailsSection = "dateTime" | "budget" | "indoorOutdoor" | "location";

export const ASSUMPTION_DETAILS_SECTION: Record<AssumptionField, AssumptionDetailsSection> = {
  when: "dateTime",
  budget: "budget",
  setting: "indoorOutdoor",
  area: "location",
};

export type AssumptionSetting = "indoor" | "outdoor" | "either";

const MAX_LABEL_CHARS = 40;
const MAX_VALUE_CHARS = 80;

function isAssumptionField(v: unknown): v is AssumptionField {
  return typeof v === "string" && (ASSUMPTION_FIELDS as readonly string[]).includes(v);
}

function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/\s+/g, " ").trim().slice(0, max).trim();
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" → local Date + whether a clock time was given. */
export function parseWhenValue(value: string | undefined | null): { date: Date; hasTime: boolean } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec((value ?? "").trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const hasTime = m[4] != null;
  const h = hasTime ? Number(m[4]) : 0;
  const mi = hasTime ? Number(m[5]) : 0;
  if (h > 23 || mi > 59) return null;
  const date = new Date(y, mo - 1, d, h, mi, 0, 0);
  // Reject roll-overs like 2026-02-31.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return { date, hasTime };
}

/** A "when" is usable only if it is in the future: a timed slot after `now`, or a day from today on. */
export function isFutureWhen(parsed: { date: Date; hasTime: boolean }, now: Date = new Date()): boolean {
  if (parsed.hasTime) return parsed.date.getTime() > now.getTime();
  return localDayKey(parsed.date) >= localDayKey(now);
}

/** "30 EUR", "30", "EUR 30", "30.5 eur" → { amount, currency }. Amount must be > 0. */
export function parseBudgetValue(
  value: string | undefined | null,
  fallbackCurrency = "EUR"
): { amount: number; currency: string } | null {
  const s = (value ?? "").trim();
  if (!s) return null;
  const num = /(\d+(?:[.,]\d+)?)/.exec(s);
  if (!num) return null;
  const amount = parseFloat(num[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) return null;
  const cur = /\b([A-Za-z]{3})\b/.exec(s);
  return { amount: Math.round(amount), currency: (cur?.[1] ?? fallbackCurrency).toUpperCase() };
}

export function parseSettingValue(value: string | undefined | null): AssumptionSetting | null {
  const s = (value ?? "").trim().toLowerCase();
  if (s === "indoor" || s === "outdoor" || s === "either") return s;
  if (s === "any" || s === "both") return "either";
  return null;
}

/**
 * Validate the gateway's `assumptions` array. Unknown fields, blank chips and duplicates are
 * dropped; a "when" in the past is dropped entirely (never show a past slot); malformed values
 * are removed but the label is kept so the chip stays editable. Output is in canonical order.
 */
export function parsePlanAssumptions(raw: unknown, now: Date = new Date()): PlanAssumption[] {
  if (!Array.isArray(raw)) return [];
  const byField = new Map<AssumptionField, PlanAssumption>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (!isAssumptionField(rec.field) || byField.has(rec.field)) continue;
    const field = rec.field;
    const label = cleanText(rec.label, MAX_LABEL_CHARS);
    let value: string | undefined = cleanText(rec.value, MAX_VALUE_CHARS) || undefined;

    if (field === "when" && value) {
      const parsed = parseWhenValue(value);
      if (parsed && !isFutureWhen(parsed, now)) continue;
      if (!parsed) value = undefined;
    } else if (field === "budget" && value) {
      const b = parseBudgetValue(value);
      value = b ? `${b.amount} ${b.currency}` : undefined;
    } else if (field === "setting" && value) {
      value = parseSettingValue(value) ?? undefined;
    }

    if (!label && !value) continue;
    byField.set(field, { field, label, ...(value ? { value } : {}) });
  }
  return ASSUMPTION_FIELDS.map((f) => byField.get(f)).filter((a): a is PlanAssumption => !!a);
}

/** Replace inferred assumptions with the user's own values for every pinned field. */
export function mergePinnedAssumptions(
  inferred: PlanAssumption[],
  pinned: Partial<Record<AssumptionField, PlanAssumption>>
): PlanAssumption[] {
  return ASSUMPTION_FIELDS.map((f) => pinned[f] ?? inferred.find((a) => a.field === f)).filter(
    (a): a is PlanAssumption => !!a
  );
}

/** Coarse time-of-day bucket for an hour (matches the activity-details Time chips). */
export function timeOfDayForHour(hour: number): TimeOfDay {
  if (hour < 11) return "morning";
  if (hour < 14) return "lunch";
  if (hour < 17) return "afternoon";
  return "evening";
}

/**
 * Inferred assumption → ActivityDetails patch, so the chip's sheet (and "Fine-tune") opens on
 * what the AI assumed. Area stays a hint: it never replaces the city in `location`.
 */
export function assumptionToDetailsPatch(a: PlanAssumption, now: Date = new Date()): Partial<ActivityDetails> {
  switch (a.field) {
    case "when": {
      const parsed = parseWhenValue(a.value);
      if (!parsed || !isFutureWhen(parsed, now)) return {};
      const day = new Date(parsed.date);
      day.setHours(0, 0, 0, 0);
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return {
        date: day,
        dateEnd: undefined,
        singleDay: true,
        datePreset: isSameCalendarDay(day, now) ? "today" : isSameCalendarDay(day, tomorrow) ? "tomorrow" : "custom",
        ...(parsed.hasTime ? { timeOfDay: timeOfDayForHour(parsed.date.getHours()) } : {}),
      };
    }
    case "budget": {
      const b = parseBudgetValue(a.value);
      return b ? { budgetAmount: String(b.amount), budgetCurrency: b.currency } : {};
    }
    case "setting": {
      const s = parseSettingValue(a.value);
      if (!s) return {};
      return { indoorOutdoor: s === "either" ? "any" : s };
    }
    case "area":
      return {};
  }
}

/** The start day an inferred/pinned "when" puts the plan on (null → keep the current day). */
export function planDayFromAssumptions(assumptions: PlanAssumption[], now: Date = new Date()): Date | null {
  const when = assumptions.find((a) => a.field === "when");
  const parsed = parseWhenValue(when?.value);
  if (!parsed || !isFutureWhen(parsed, now)) return null;
  const day = new Date(parsed.date);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** Split a "City, Country" location line (last comma = country). */
function cityFromLocation(location: string | undefined): string | undefined {
  const s = (location ?? "").trim();
  if (!s) return undefined;
  const i = s.lastIndexOf(",");
  return (i < 0 ? s : s.slice(0, i)).trim() || undefined;
}

/**
 * A user-corrected field → the assumption chip it now shows. `label` is left empty on purpose:
 * the UI formats pinned values itself (localized), and only model labels are shown verbatim.
 */
export function assumptionFromDetails(field: AssumptionField, details: Partial<ActivityDetails>): PlanAssumption {
  switch (field) {
    case "when": {
      const day = details.date ? localDayKey(details.date) : undefined;
      const hm = details.singleDay !== false && details.exactTimeHm && /^\d{2}:\d{2}$/.test(details.exactTimeHm)
        ? details.exactTimeHm
        : undefined;
      return { field, label: "", ...(day ? { value: hm ? `${day}T${hm}` : day } : {}) };
    }
    case "budget": {
      const b = parseBudgetValue(details.budgetAmount, details.budgetCurrency || "EUR");
      return { field, label: "", ...(b ? { value: `${b.amount} ${details.budgetCurrency || b.currency}` } : {}) };
    }
    case "setting": {
      const io = details.indoorOutdoor;
      return { field, label: "", value: io === "indoor" || io === "outdoor" ? io : "either" };
    }
    case "area": {
      const area = details.pinLabel?.trim() || cityFromLocation(details.location);
      return { field, label: "", ...(area ? { value: area } : {}) };
    }
  }
}

/** Context keys winkly_plan reads for fields the user fixed (the gateway then won't re-infer them). */
export type PinnedPlanContext = {
  pinned_fields: AssumptionField[];
  date_from?: string;
  date_to?: string;
  time_preference?: Exclude<TimeOfDay, "any">;
  budget_amount?: number;
  budget_currency?: string;
  indoor_outdoor?: "indoor" | "outdoor";
  area_hint?: string;
  latitude?: number;
  longitude?: number;
  search_radius_km?: number;
};

export function pinnedContextFromDetails(
  pinned: readonly AssumptionField[],
  details: Partial<ActivityDetails>
): PinnedPlanContext {
  const fields = ASSUMPTION_FIELDS.filter((f) => pinned.includes(f));
  const out: PinnedPlanContext = { pinned_fields: [] };
  for (const f of fields) {
    if (f === "when") {
      if (!details.date) continue;
      const day = localDayKey(details.date);
      const single = details.singleDay !== false;
      const hm = single && details.exactTimeHm && /^\d{2}:\d{2}$/.test(details.exactTimeHm) ? details.exactTimeHm : undefined;
      out.date_from = hm ? `${day}T${hm}` : day;
      if (!single && details.dateEnd) out.date_to = localDayKey(details.dateEnd);
      if (single && !hm && details.timeOfDay && details.timeOfDay !== "any") out.time_preference = details.timeOfDay;
      out.pinned_fields.push(f);
    } else if (f === "budget") {
      const b = parseBudgetValue(details.budgetAmount, details.budgetCurrency || "EUR");
      if (!b) continue;
      out.budget_amount = b.amount;
      out.budget_currency = details.budgetCurrency || b.currency;
      out.pinned_fields.push(f);
    } else if (f === "setting") {
      if (details.indoorOutdoor === "indoor" || details.indoorOutdoor === "outdoor") {
        out.indoor_outdoor = details.indoorOutdoor;
      }
      // "Any" is still a deliberate choice — pin it so the model stops guessing.
      out.pinned_fields.push(f);
    } else if (f === "area") {
      const area = details.pinLabel?.trim() || cityFromLocation(details.location);
      if (!area) continue;
      out.area_hint = area.slice(0, MAX_VALUE_CHARS);
      if (typeof details.latitude === "number" && typeof details.longitude === "number") {
        out.latitude = details.latitude;
        out.longitude = details.longitude;
      }
      if (typeof details.searchRadiusKm === "number") out.search_radius_km = details.searchRadiusKm;
      out.pinned_fields.push(f);
    }
  }
  return out;
}
