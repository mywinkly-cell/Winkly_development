import {
  IDLE_PLAN_LOADING_PROGRESS,
  visiblePlanLoadingSteps,
  type PlanLoadingProgress,
} from "@/lib/ai/planLoadingSteps";
import { flipFaces, revealDelayMs, revealTotalMs } from "@/components/ds/revealCardsTiming";

describe("visiblePlanLoadingSteps", () => {
  it("shows nothing before any real step has started", () => {
    expect(visiblePlanLoadingSteps(IDLE_PLAN_LOADING_PROGRESS)).toEqual([]);
  });

  it("never mentions weather when no weather fetch happened (no city)", () => {
    const steps = visiblePlanLoadingSteps({ weather: "none", gatewayInFlight: true });
    expect(steps.map((s) => s.id)).toEqual(["places", "match"]);
  });

  it("shows weather as active only while the fetch is in flight, gateway steps not yet", () => {
    const steps = visiblePlanLoadingSteps({ weather: "active", gatewayInFlight: false });
    expect(steps).toEqual([{ id: "weather", status: "active", labelKey: "planLoading.weather" }]);
  });

  it("marks weather done once observed, without claiming gateway steps before the call starts", () => {
    const steps = visiblePlanLoadingSteps({ weather: "done", gatewayInFlight: false });
    expect(steps).toEqual([{ id: "weather", status: "done", labelKey: "planLoading.weatherDone" }]);
  });

  it("runs places + match together while the single gateway call is in flight — never 'done'", () => {
    const progress: PlanLoadingProgress = { weather: "done", gatewayInFlight: true };
    const steps = visiblePlanLoadingSteps(progress, { city: "Munich" });
    expect(steps.map((s) => [s.id, s.status])).toEqual([
      ["weather", "done"],
      ["places", "active"],
      ["match", "active"],
    ]);
    expect(steps.find((s) => s.id === "places")).toMatchObject({
      labelKey: "planLoading.placesIn",
      labelParams: { city: "Munich" },
    });
  });

  it("names the partner only when one is given", () => {
    const progress: PlanLoadingProgress = { weather: "none", gatewayInFlight: true };
    expect(visiblePlanLoadingSteps(progress, { partnerName: "Anna" }).find((s) => s.id === "match")).toMatchObject({
      labelKey: "planLoading.matchWith",
      labelParams: { name: "Anna" },
    });
    expect(visiblePlanLoadingSteps(progress, { partnerName: "  " }).find((s) => s.id === "match")).toMatchObject({
      labelKey: "planLoading.match",
    });
    expect(visiblePlanLoadingSteps(progress, { city: "" }).find((s) => s.id === "places")?.labelKey).toBe(
      "planLoading.places"
    );
  });
});

describe("reveal timing", () => {
  it("staggers cards by 120 ms by default", () => {
    expect([0, 1, 2].map((i) => revealDelayMs(i))).toEqual([0, 120, 240]);
    expect(revealDelayMs(-3)).toBe(0);
    expect(revealDelayMs(Number.NaN)).toBe(0);
  });

  it("total reveal time: stagger + one flip; a single fade under reduced motion", () => {
    expect(revealTotalMs(0, { reduceMotion: false })).toBe(0);
    expect(revealTotalMs(3, { reduceMotion: false, staggerMs: 120, flipMs: 400 })).toBe(640);
    expect(revealTotalMs(3, { reduceMotion: true, fadeMs: 200 })).toBe(200);
  });

  it("swaps faces at the flip midpoint and clamps progress", () => {
    expect(flipFaces(0)).toEqual({ backDeg: 0, frontDeg: -180, frontVisible: false });
    expect(flipFaces(0.49).frontVisible).toBe(false);
    expect(flipFaces(0.5).frontVisible).toBe(true);
    expect(flipFaces(1)).toEqual({ backDeg: 180, frontDeg: 0, frontVisible: true });
    expect(flipFaces(2)).toEqual(flipFaces(1));
    expect(flipFaces(-1)).toEqual(flipFaces(0));
  });
});
