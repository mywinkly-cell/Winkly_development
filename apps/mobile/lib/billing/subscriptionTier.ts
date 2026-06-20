import type { SubscriptionTier } from "@/types";

const VALID: SubscriptionTier[] = ["free", "super", "premium", "enterprise"];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Maps `users.subscription_tier` (or legacy flags) to a known tier. */
export function normalizeSubscriptionTier(
  raw: string | null | undefined,
  legacyPremium?: boolean,
): SubscriptionTier {
  const s = String(raw ?? "").trim().toLowerCase();
  if (VALID.includes(s as SubscriptionTier)) return s as SubscriptionTier;
  if (legacyPremium) return "premium";
  return "free";
}

export type EffectiveTier = {
  /** Tier to enforce right now. */
  tier: SubscriptionTier;
  /** True when premium access comes from the new-user trial, not a paid plan. */
  isOnTrial: boolean;
  /** ISO end of the trial when `isOnTrial`, else null. */
  trialEndsAt: string | null;
};

/**
 * Resolve the tier to enforce, honoring (in order): a dev override, an active
 * paid tier, then the new-user Premium trial, then Free.
 *
 * IMPORTANT: the ai-gateway re-implements this same precedence server-side
 * (`effectiveTierFromRow` in supabase/functions/ai-gateway/index.ts) — keep
 * the two in sync so client UI and server AI gating always agree.
 */
export function computeEffectiveTier(opts: {
  tierFromDb?: string | null;
  isPremium?: boolean | null;
  /** ISO; paid tier expiry. Null/absent = no expiry. */
  premiumUntil?: string | null;
  /** ISO; end of the new-user trial. */
  trialEndsAt?: string | null;
  isDev?: boolean;
  now?: Date;
}): EffectiveTier {
  if (opts.isDev) return { tier: "premium", isOnTrial: false, trialEndsAt: null };

  const nowMs = (opts.now ?? new Date()).getTime();

  const paid = normalizeSubscriptionTier(opts.tierFromDb, opts.isPremium ?? false);
  if (paid !== "free") {
    const pu = opts.premiumUntil ? Date.parse(opts.premiumUntil) : NaN;
    const active = !Number.isFinite(pu) || pu > nowMs; // no expiry recorded → treat active
    if (active) return { tier: paid, isOnTrial: false, trialEndsAt: null };
  }

  if (opts.trialEndsAt) {
    const end = Date.parse(opts.trialEndsAt);
    if (Number.isFinite(end) && end > nowMs) {
      return { tier: "premium", isOnTrial: true, trialEndsAt: opts.trialEndsAt };
    }
  }

  return { tier: "free", isOnTrial: false, trialEndsAt: null };
}

/** Whole days left in the trial (rounded up); 0 when not on trial / expired. */
export function trialDaysRemaining(trialEndsAt: string | null | undefined, now: Date = new Date()): number {
  if (!trialEndsAt) return 0;
  const end = Date.parse(trialEndsAt);
  if (!Number.isFinite(end)) return 0;
  const ms = end - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / DAY_MS);
}
