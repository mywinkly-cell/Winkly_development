// apps/mobile/providers/ModeContextProvider.tsx
// Active Mode Context — single source of truth for mode/authz (Identity Firewall)

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { reconcileActiveMode, resolvePermissions, resolveSubscriptionTier } from "@/lib/mode/permissions";
import { trackModeSelected } from "@/lib/analytics/events";
import type { ActiveModeContext, AccountType, Mode } from "@/types";

const defaultContext: ActiveModeContext = {
  user_id: "",
  account_type: "personal",
  active_mode: null,
  active_persona_id: null,
  permissions: ["events"],
  subscription_tier: "free",
};

const ModeContext = createContext<{
  context: ActiveModeContext;
  setActiveMode: (mode: Mode, personaId?: string | null) => void;
  resetMode: () => void;
  /** Force a fresh load from Supabase, bypassing the cache (e.g. after a sub-profile/mode is added). */
  refresh: () => Promise<void>;
  loading: boolean;
}>({
  context: defaultContext,
  setActiveMode: () => {},
  resetMode: () => {},
  refresh: async () => {},
  loading: true,
});

function isAuthError(err: unknown): boolean {
  const e = err as { name?: string; message?: string };
  const name = String(e?.name ?? "").toLowerCase();
  const msg = String(e?.message ?? err ?? "").toLowerCase();
  return name === "authapierror" || msg.includes("auth") && msg.includes("session");
}

/** DB-derived authz fields (everything except the local-only active_mode/persona). */
type LoadedContextData = Pick<ActiveModeContext, "account_type" | "permissions" | "subscription_tier">;

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
          .select("account_type, is_premium, subscription_tier")
          .eq("id", userId)
          .maybeSingle<{ account_type?: string; is_premium?: boolean; subscription_tier?: string }>();

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

        // subscription_tier comes from the DB. If the row is missing entirely
        // (no users record yet), fall back to is_premium -> premium | free.
        const subscription_tier = resolveSubscriptionTier({
          tierFromDb: userRow?.subscription_tier,
          isPremium: userRow?.is_premium,
          isDev: __DEV__,
        });

        return { status: "ok", data: { account_type: at, permissions, subscription_tier } };
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

  const refresh = useCallback(() => loadUserContext({ force: true }), [loadUserContext]);

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
