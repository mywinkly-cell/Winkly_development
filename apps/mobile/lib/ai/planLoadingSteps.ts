// apps/mobile/lib/ai/planLoadingSteps.ts
// Honest loading copy for plan generation (Concierge planner → ai-gateway `planner_theme_plans`).
//
// Rule: a line only appears once its step has actually started, and only gets a "done" state
// when the app has observed it finish. Nothing is timed or faked.
//
// What really happens for one request:
//   1. weather — the app fetches a forecast itself (lib/weatherClient) before calling the
//      gateway, but only when a city is known. Observed start + finish.
//   2. places + match — one gateway call: it resolves a real venue via Google Places text
//      search and loads every participant's profile to tailor the options. Both run inside the
//      same request, so both lines go active together when the call starts and stay active until
//      results arrive — we never pretend one finished before the other.

export type PlanLoadingStepId = "weather" | "places" | "match";
export type PlanLoadingStepStatus = "active" | "done";

/** Observed progress of one generation, driven by real events in the planning flow. */
export type PlanLoadingProgress = {
  /** "none" = no weather fetch in this request (no city) or not started yet. */
  weather: "none" | "active" | "done";
  /** True from the moment the ai-gateway request is sent until it resolves. */
  gatewayInFlight: boolean;
};

export const IDLE_PLAN_LOADING_PROGRESS: PlanLoadingProgress = { weather: "none", gatewayInFlight: false };

export type PlanLoadingStep = {
  id: PlanLoadingStepId;
  status: PlanLoadingStepStatus;
  /** i18n key under `planLoading.*`. */
  labelKey: string;
  labelParams?: Record<string, string>;
};

export function visiblePlanLoadingSteps(
  progress: PlanLoadingProgress,
  opts: { city?: string | null; partnerName?: string | null } = {}
): PlanLoadingStep[] {
  const steps: PlanLoadingStep[] = [];
  const city = opts.city?.trim();
  const partnerName = opts.partnerName?.trim();

  if (progress.weather !== "none") {
    const done = progress.weather === "done";
    steps.push({
      id: "weather",
      status: done ? "done" : "active",
      labelKey: done ? "planLoading.weatherDone" : "planLoading.weather",
    });
  }

  if (progress.gatewayInFlight) {
    steps.push(
      city
        ? { id: "places", status: "active", labelKey: "planLoading.placesIn", labelParams: { city } }
        : { id: "places", status: "active", labelKey: "planLoading.places" },
      partnerName
        ? { id: "match", status: "active", labelKey: "planLoading.matchWith", labelParams: { name: partnerName } }
        : { id: "match", status: "active", labelKey: "planLoading.match" }
    );
  }

  return steps;
}
