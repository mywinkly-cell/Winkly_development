/**
 * Plan-it bar — which suggestion chips and placeholder examples to show. Pure logic; the
 * component (components/ai/PlanItBar.tsx) turns the keys into i18n strings.
 */

import type { Mode } from "@/types";

export type PlanItChipKey =
  | "tonight"
  | "tomorrow"
  | "this_weekend"
  | "next_weekend"
  | "something_new"
  | "with_person";

/** Past this hour "tonight" is too late to be useful — suggest tomorrow instead. */
const LATE_EVENING_HOUR = 20;

/**
 * Three chips that make sense right now:
 * - a near-term chip: "Tonight" (or "Tomorrow" once it's late),
 * - a weekend chip: "This weekend" (or "Next weekend" from Sunday afternoon on),
 * - "Something new" — or, when opened from a person, "With {name}" leads.
 */
export function getPlanItChips(params: { now?: Date; personName?: string | null }): PlanItChipKey[] {
  const now = params.now ?? new Date();
  const day = now.getDay(); // 0 = Sun … 6 = Sat
  const hour = now.getHours();
  const nearTerm: PlanItChipKey = hour >= LATE_EVENING_HOUR ? "tomorrow" : "tonight";
  const weekend: PlanItChipKey = day === 0 && hour >= 15 ? "next_weekend" : "this_weekend";
  if (params.personName?.trim()) return ["with_person", nearTerm, weekend];
  return [nearTerm, weekend, "something_new"];
}

/** Number of rotating placeholder examples per mode (keys planIt.example.<mode>.<1..N>). */
export const PLAN_IT_EXAMPLE_COUNT = 3;

/** Planner "All" / Business fall back to the friends examples (the most generic set). */
export function planItExampleMode(mode: Mode): "romance" | "friends" | "events" {
  return mode === "romance" || mode === "events" ? mode : "friends";
}

/** i18n key of the placeholder example to show at rotation tick `tick`. */
export function planItExampleKey(mode: Mode, tick: number): string {
  const n = ((Math.floor(tick) % PLAN_IT_EXAMPLE_COUNT) + PLAN_IT_EXAMPLE_COUNT) % PLAN_IT_EXAMPLE_COUNT;
  return `planIt.example.${planItExampleMode(mode)}.${n + 1}`;
}

/** Max characters for a Plan-it request (the gateway also clamps user_prompt server-side). */
export const PLAN_IT_MAX_CHARS = 200;

/** Normalize what the user typed; null when there's nothing to plan. */
export function normalizePlanItRequest(text: string | null | undefined): string | null {
  const s = (text ?? "").replace(/\s+/g, " ").trim().slice(0, PLAN_IT_MAX_CHARS).trim();
  return s.length >= 2 ? s : null;
}
