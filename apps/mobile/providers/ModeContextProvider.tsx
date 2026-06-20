// apps/mobile/providers/ModeContextProvider.tsx
// Active Mode Context — single source of truth for mode/authz (Identity Firewall)

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { reconcileActiveMode, resolvePermissions } from "@/lib/mode/permissions";
import { computeEffectiveTier } from "@/lib/billing/subscriptionTier";
import { trackModeSelected } from "@/lib/analytics/events";
import type { ActiveModeContext, AccountType, Mode } from "@/types";

const defaultContext: ActiveModeContext = {
  user_id: "",
  account_type: "personal",
  active_mode: null,
  active_persona_id: null,
  permissions: ["events"],
  subscription_tier: "free",
  is_on_trial: false,
  trial_ends_at: null,
};

const ModeContext = createContext<{
  context: ActiveModeContext;
  setActiveMode: (mode: Mode, personaId?: string | null) => void;
  resetMode: () => void;
  /** Force a fresh load from Supabase, bypassing the cache. Returns latest permissions when load succeeds. */
  refresh: () => Promise<Mode[] | null>;
  loading: boolean;
}>({
  context: defaultContext,
  setActiveMode: () => {},
  resetMode: () => {},
  refresh: async () => null,
  loading: true,
});

function isAuthError(err: unknown): boolean {
  const e = err as { name?: string; message?: string };
  const name = String(e?.name ?? "").toLowerCase();
  const msg = String(e?.message ?? err ?? "").toLowerCase();
  return name === "authapierror" || msg.includes("auth") && msg.includes("session");
}

/** DB-derived authz fields (everything except the local-only active_mode/persona). */
type LoadedContextData = Pick<
  ActiveModeContext,
  "account_type" | "permissions" | "subscription_tier" | "is_on_trial" | "trial_ends_at"
>;

/**
 * Short-lived, module-level cache of the authz context keyed by user id.
 * Stale-while-revalidate: a cached value is served instantly (no spinner) and
 * only re-fetched from Supabase when older than CONTEXT_CACHE_TTL_MS or on an
 * explicit refresh(). Module scope means it survives provider remounts within
 * a session and is cleared on sign-out / app reload.
 */
const CONTEXT_CACHE_TTL_MS = 60_000;
let contextCache: { userId: string; data: LoadedContextData; fetchedAt: number } | null = null;

export function ModeContextProvider({ children }: { children: React.ReactNode }) {
  const { user, accountType, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [context, setContext] = useState<ActiveModeContext>(defaultContext);
  const [loading, setLoading] = useState(true);

  /** Merge DB-derived authz fields into context, preserving local active_mode/persona. */
  const applyLoadedData = useCallback((userId: string, data: LoadedContextData) => {
    setContext((prev) => ({
      ...prev,
      user_id: userId,
      account_type: data.account_type,
      permissions: data.permissions,
      subscription_tier: data.subscription_tier,
      is_on_trial: data.is_on_trial,
      trial_ends_at: data.trial_ends_at,
      active_mode: reconcileActiveMode(prev.active_mode, data.permissions),
      active_persona_id: prev.active_persona_id,
    }));
  }, []);

  /** Network-only fetch of the authz context. No state side effects. */
  const fetchUserContextData = useCallback(
    async (
      userId: string
    ): Promise<{ status: "ok"; data: LoadedContextData } | { status: "authError" } | { status: "error" }> => {
      try {
        // users.subscription_tier is part of the finalized schema
        // (migration 20250216000001_subscription_tier.sql), so we select it directly.
        const { data: userRow, error: userErr } = await supabase
          .from("users")
          .select("account_type, is_premium, subscription_tier, premium_until, trial_ends_at")
          .eq("id", userId)
          .maybeSingle<{
            account_type?: string;
            is_premium?: boolean;
            subscription_tier?: string;
            premium_until?: string | null;
            trial_ends_at?: string | null;
          }>();

        if (userErr && isAuthError(userErr)) return { status: "authError" };
        if (userErr) {
          console.warn("ModeContext: users fetch failed", userErr);
        }

        const at: AccountType = (userRow?.account_type as AccountType) ?? accountType ?? "personal";

        let subProfileModes: string[] = [];
        if (at === "personal") {
          const { data: profiles, error: profErr } = await supabase
            .from("sub_profiles")
            .select("mode")
            .eq("user_id", userId);
          if (profErr && isAuthError(profErr)) return { status: "authError" };
          subProfileModes = (profiles ?? []).map((p: { mode: string }) => p.mode);
        }
        const permissions = resolvePermissions(at, subProfileModes);

        // Effective tier: active paid plan → new-user Premium trial → free.
        // (Mirrors effectiveTierFromRow in the ai-gateway for server-side gating.)
        const eff = computeEffectiveTier({
          tierFromDb: userRow?.subscription_tier,
          isPremium: userRow?.is_premium,
          premiumUntil: userRow?.premium_until,
          trialEndsAt: userRow?.trial_ends_at,
          isDev: __DEV__,
        });

        return {
          status: "ok",
          data: {
            account_type: at,
            permissions,
            subscription_tier: eff.tier,
            is_on_trial: eff.isOnTrial,
            trial_ends_at: eff.trialEndsAt,
          },
        };
      } catch (e) {
        if (isAuthError(e)) return { status: "authError" };
        console.warn("ModeContext load error", e);
        return { status: "error" };
      }
    },
    [accountType]
  );

  const loadUserContext = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!user) {
        contextCache = null;
        setContext(defaultContext);
        setLoading(false);
        return;
      }

      // Stale-while-revalidate: serve a cached value instantly so navigation
      // never blocks on the network. Skip the fetch entirely when still fresh.
      const cached = contextCache && contextCache.userId === user.id ? contextCache : null;
      if (cached) {
        applyLoadedData(user.id, cached.data);
        setLoading(false);
        const isFresh = Date.now() - cached.fetchedAt < CONTEXT_CACHE_TTL_MS;
        if (isFresh && !opts?.force) return;
        // Stale or forced: revalidate in the background without a spinner.
      } else {
        setLoading(true);
      }

      const result = await fetchUserContextData(user.id);

      if (result.status === "authError") {
        contextCache = null;
        signOut();
        setContext(defaultContext);
        setLoading(false);
        return;
      }

      if (result.status === "ok") {
        contextCache = { userId: user.id, data: result.data, fetchedAt: Date.now() };
        applyLoadedData(user.id, result.data);
      } else if (!cached) {
        // Network/parse error and nothing cached: minimal safe fallback (Events only).
        setContext({
          ...defaultContext,
          user_id: user.id,
          account_type: accountType ?? "personal",
          permissions: ["events"],
        });
      }
      // On error with an existing cached value, keep showing it.

      setLoading(false);
    },
    [user, accountType, signOut, fetchUserContextData, applyLoadedData]
  );

  const refresh = useCallback(async (): Promise<Mode[] | null> => {
    if (!user) return null;
    const cached = contextCache && contextCache.userId === user.id ? contextCache : null;
    const result = await fetchUserContextData(user.id);
    if (result.status === "authError") {
      contextCache = null;
      signOut();
      setContext(defaultContext);
      setLoading(false);
      return null;
    }
    if (result.status === "ok") {
      contextCache = { userId: user.id, data: result.data, fetchedAt: Date.now() };
      applyLoadedData(user.id, result.data);
      setLoading(false);
      return result.data.permissions;
    }
    return cached?.data.permissions ?? null;
  }, [user, signOut, fetchUserContextData, applyLoadedData]);

  useEffect(() => {
    if (!authLoading) loadUserContext();
  }, [authLoading, loadUserContext]);

  const setActiveMode = useCallback(
    (mode: Mode, personaId?: string | null) => {
      setContext((prev) => ({
        ...prev,
        active_mode: mode,
        active_persona_id: personaId ?? null,
      }));

      trackModeSelected(mode);

      // Mode switching resets router stack (Identity Firewall)
      const routes: Record<Mode, string> = {
        romance: "/(modes)/romance",
        friends: "/(modes)/friends",
        business: "/(modes)/business",
        events: "/(modes)/events",
      };
      router.replace(routes[mode] as any);
    },
    [router]
  );

  const resetMode = useCallback(() => {
    setContext((prev) => ({
      ...prev,
      active_mode: null,
      active_persona_id: null,
    }));
  }, []);

  return (
    <ModeContext.Provider value={{ context, setActiveMode, resetMode, refresh, loading }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useModeContext() {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error("useModeContext must be used within ModeContextProvider");
  return ctx;
}
