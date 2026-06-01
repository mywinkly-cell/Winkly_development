// apps/mobile/lib/auth/session.ts
// Pure auth-session helpers shared by AuthProvider. Kept free of React/Supabase
// runtime imports so the highest-risk session logic can be unit-tested.

import type { Session } from "@supabase/supabase-js";
import type { AccountType } from "@/types";

/**
 * A Supabase auth error is "recoverable" when the right response is to clear
 * the local session (sign out) rather than surface an error. Covers expired /
 * missing / invalid refresh tokens — the common cold-start failure modes.
 */
export function isAuthRecoverableError(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null | undefined;
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

export type DerivedAuthState = {
  session: Session | null;
  user: Session["user"] | null;
  accountType: AccountType | null;
};

/** Derive the public auth state from a (possibly null) session. */
export function deriveAuthState(session: Session | null): DerivedAuthState {
  return {
    session: session ?? null,
    user: session?.user ?? null,
    accountType: (session?.user?.user_metadata?.account_type as AccountType) ?? null,
  };
}

/** True when a session carries an authenticated user id worth syncing push/analytics for. */
export function hasAuthenticatedUser(session: Session | null): boolean {
  return Boolean(session?.user?.id);
}
