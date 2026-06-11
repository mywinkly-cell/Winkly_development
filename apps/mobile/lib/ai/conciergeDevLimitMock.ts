/**
 * Dev-only: force ConciergeRateLimitCard without hitting ai-gateway.
 * Set EXPO_PUBLIC_DEBUG_CONCIERGE_RATE_LIMIT in apps/mobile/.env and restart Metro.
 *
 * Values: burst | daily | tier | tier_premium  (or 1 / true → burst)
 */

import type { ConciergeResponse } from "./conciergeClient";

type DevLimitScenario = "burst" | "daily_quota" | "tier" | "tier_premium";

function devLimitScenario(): DevLimitScenario | null {
  if (!__DEV__) return null;
  const raw = (process.env.EXPO_PUBLIC_DEBUG_CONCIERGE_RATE_LIMIT ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "1" || raw === "true" || raw === "burst") return "burst";
  if (raw === "daily" || raw === "daily_quota") return "daily_quota";
  if (raw === "tier" || raw === "super") return "tier";
  if (raw === "tier_premium" || raw === "premium") return "tier_premium";
  return null;
}

function secondsUntilUtcMidnight(): number {
  const now = Date.now();
  const next = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate() + 1,
  );
  return Math.max(60, Math.ceil((next - now) / 1000));
}

/** When set in __DEV__, returns a mock limit response instead of calling the gateway. */
export function getConciergeDevLimitMockResponse(): ConciergeResponse | null {
  const scenario = devLimitScenario();
  if (!scenario) return null;

  switch (scenario) {
    case "burst":
      return {
        message: "",
        error_code: "rate_limit",
        limit_type: "burst",
        retry_after: 60,
      };
    case "daily_quota":
      return {
        message: "",
        error_code: "daily_quota",
        limit_type: "daily_quota",
        retry_after: secondsUntilUtcMidnight(),
        upgrade_to: "super",
      };
    case "tier":
      return {
        message: "",
        error_code: "tier_required",
        upgrade_to: "super",
      };
    case "tier_premium":
      return {
        message: "",
        error_code: "tier_required",
        upgrade_to: "premium",
      };
    default:
      return null;
  }
}

export function isConciergeDevLimitMockEnabled(): boolean {
  return devLimitScenario() != null;
}
