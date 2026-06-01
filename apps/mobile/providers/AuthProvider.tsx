// apps/mobile/providers/AuthProvider.tsx
// Supabase Auth session — single source of truth for auth state

import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { AccountType } from "@/types";
import { deriveAuthState, hasAuthenticatedUser, isAuthRecoverableError } from "@/lib/auth/session";
import { setMonitoringUser } from "@/lib/monitoring/sentry";
import {
  initializeNotificationsRuntime,
  registerForPushNotificationsAndSync,
  resetNotificationsRuntime,
} from "@/lib/notifications";

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  accountType: AccountType | null;
};

const defaultState: AuthState = {
  session: null,
  user: null,
  loading: true,
  accountType: null,
};

type AuthContextValue = AuthState & {
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(defaultState);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error && isAuthRecoverableError(error)) {
          try {
            await supabase.auth.signOut({ scope: "local" });
          } catch {
            // ignore signOut errors (e.g. AuthSessionMissingError)
          }
          resetNotificationsRuntime();
          setState({ session: null, user: null, loading: false, accountType: null });
          return;
        }
        const effectiveSession = error ? null : session;
        setState((prev) => ({
          ...prev,
          ...deriveAuthState(effectiveSession),
          loading: false,
        }));
        if (hasAuthenticatedUser(effectiveSession)) {
          void initializeNotificationsRuntime().then(() => registerForPushNotificationsAndSync());
        } else {
          resetNotificationsRuntime();
        }
      } catch (err) {
        if (isAuthRecoverableError(err)) {
          try {
            await supabase.auth.signOut({ scope: "local" });
          } catch {
            // ignore signOut errors
          }
        }
        resetNotificationsRuntime();
        setState({ session: null, user: null, loading: false, accountType: null });
      }
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ ...deriveAuthState(session), loading: false });
      if (hasAuthenticatedUser(session)) {
        void initializeNotificationsRuntime().then(() => registerForPushNotificationsAndSync());
      } else {
        resetNotificationsRuntime();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Attach/detach the user on crash reports as auth state changes (no-op without a Sentry DSN).
  useEffect(() => {
    setMonitoringUser(
      state.user ? { id: state.user.id, account_type: state.accountType ?? undefined } : null
    );
  }, [state.user, state.accountType]);

  const signOut = async () => {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // AuthApiError / AuthSessionMissingError: still clear local state
    }
    resetNotificationsRuntime();
    setState({ session: null, user: null, loading: false, accountType: null });
  };

  return (
    <AuthContext.Provider value={{ ...state, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
