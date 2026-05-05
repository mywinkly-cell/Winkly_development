// apps/mobile/providers/AuthProvider.tsx
// Supabase Auth session — single source of truth for auth state

import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { AccountType } from "@/types";

function isAuthRecoverableError(err: unknown): boolean {
  const e = err as { name?: string; message?: string };
  const name = String(e?.name ?? "").toLowerCase();
  const msg = String(e?.message ?? err ?? "").toLowerCase();
  return (
    name === "authapierror" ||
    name === "authsessionmissingerror" ||
    (msg.includes("refresh token") && (msg.includes("invalid") || msg.includes("not found"))) ||
    msg.includes("session expired") ||
    msg.includes("invalid refresh token")
  );
}

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
          setState({ session: null, user: null, loading: false, accountType: null });
          return;
        }
        setState((prev) => ({
          ...prev,
          session: error ? null : session,
          user: session?.user ?? null,
          accountType: (session?.user?.user_metadata?.account_type as AccountType) ?? null,
          loading: false,
        }));
      } catch (err) {
        if (isAuthRecoverableError(err)) {
          try {
            await supabase.auth.signOut({ scope: "local" });
          } catch {
            // ignore signOut errors
          }
        }
        setState({ session: null, user: null, loading: false, accountType: null });
      }
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({
        session,
        user: session?.user ?? null,
        loading: false,
        accountType: (session?.user?.user_metadata?.account_type as AccountType) ?? null,
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // AuthApiError / AuthSessionMissingError: still clear local state
    }
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
