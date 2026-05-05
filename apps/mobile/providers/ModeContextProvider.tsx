// apps/mobile/providers/ModeContextProvider.tsx
// Active Mode Context — single source of truth for mode/authz (Identity Firewall)

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
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
  loading: boolean;
}>({
  context: defaultContext,
  setActiveMode: () => {},
  resetMode: () => {},
  loading: true,
});

function isAuthError(err: unknown): boolean {
  const e = err as { name?: string; message?: string };
  const name = String(e?.name ?? "").toLowerCase();
  const msg = String(e?.message ?? err ?? "").toLowerCase();
  return name === "authapierror" || msg.includes("auth") && msg.includes("session");
}

export function ModeContextProvider({ children }: { children: React.ReactNode }) {
  const { user, accountType, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [context, setContext] = useState<ActiveModeContext>(defaultContext);
  const [loading, setLoading] = useState(true);

  const loadUserContext = useCallback(async () => {
    if (!user) {
      setContext(defaultContext);
      setLoading(false);
      return;
    }

    try {
      const { data: userRow, error: userErr } = await supabase
        .from("users")
        .select("account_type, is_premium")
        .eq("id", user.id)
        .maybeSingle();

      if (userErr && isAuthError(userErr)) {
        signOut();
        setContext(defaultContext);
        setLoading(false);
        return;
      }
      if (userErr) {
        console.warn("ModeContext: users fetch failed", userErr);
      }

      const at: AccountType = (userRow?.account_type as AccountType) ?? accountType ?? "personal";

      const permissions: Mode[] = ["events"];
      if (at === "personal") {
        try {
          const { data: profiles, error: profErr } = await supabase
            .from("sub_profiles")
            .select("mode")
            .eq("user_id", user.id);
          if (profErr && isAuthError(profErr)) {
            signOut();
            setContext(defaultContext);
            setLoading(false);
            return;
          }
          const modes = (profiles ?? []).map((p: { mode: string }) => p.mode as Mode);
          if (modes.includes("romance")) permissions.push("romance");
          if (modes.includes("friends")) permissions.push("friends");
          if (modes.includes("business")) permissions.push("business");
        } catch (e) {
          if (isAuthError(e)) {
            signOut();
            setContext(defaultContext);
            setLoading(false);
            return;
          }
          // Table may not exist yet; Events always allowed
        }
      } else {
        permissions.push("business");
      }

      setContext((prev) => ({
        ...prev,
        user_id: user.id,
        account_type: at,
        permissions,
        // Development: act as Premium so all features are available for testing
        subscription_tier: __DEV__ ? "premium" : (userRow?.is_premium ? "premium" : "free"),
        active_mode: prev.active_mode && permissions.includes(prev.active_mode) ? prev.active_mode : null,
        active_persona_id: prev.active_persona_id,
      }));
    } catch (e) {
      if (isAuthError(e)) {
        signOut();
        setContext(defaultContext);
      } else {
        console.warn("ModeContext load error", e);
        setContext({
          ...defaultContext,
          user_id: user.id,
          account_type: accountType ?? "personal",
          permissions: ["events"],
        });
      }
    } finally {
      setLoading(false);
    }
  }, [user, accountType, signOut]);

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
    <ModeContext.Provider value={{ context, setActiveMode, resetMode, loading }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useModeContext() {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error("useModeContext must be used within ModeContextProvider");
  return ctx;
}
