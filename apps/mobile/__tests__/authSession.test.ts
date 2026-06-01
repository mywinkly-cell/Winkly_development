import type { Session } from "@supabase/supabase-js";
import {
  deriveAuthState,
  hasAuthenticatedUser,
  isAuthRecoverableError,
} from "@/lib/auth/session";

function makeSession(overrides: Partial<Session["user"]> = {}): Session {
  return {
    access_token: "a",
    refresh_token: "r",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: "user-1",
      app_metadata: {},
      user_metadata: { account_type: "personal" },
      aud: "authenticated",
      created_at: "2024-01-01",
      ...overrides,
    },
  } as unknown as Session;
}

describe("isAuthRecoverableError", () => {
  it("treats AuthApiError / AuthSessionMissingError as recoverable", () => {
    expect(isAuthRecoverableError({ name: "AuthApiError" })).toBe(true);
    expect(isAuthRecoverableError({ name: "AuthSessionMissingError" })).toBe(true);
  });

  it("treats invalid/expired refresh token messages as recoverable", () => {
    expect(isAuthRecoverableError({ message: "Invalid Refresh Token: Not Found" })).toBe(true);
    expect(isAuthRecoverableError({ message: "session expired" })).toBe(true);
    expect(isAuthRecoverableError("invalid refresh token")).toBe(true);
  });

  it("does not treat unrelated errors as recoverable", () => {
    expect(isAuthRecoverableError({ name: "TypeError", message: "boom" })).toBe(false);
    expect(isAuthRecoverableError(new Error("network request failed"))).toBe(false);
    expect(isAuthRecoverableError(null)).toBe(false);
    expect(isAuthRecoverableError(undefined)).toBe(false);
  });
});

describe("deriveAuthState", () => {
  it("returns nulls for a null session", () => {
    expect(deriveAuthState(null)).toEqual({ session: null, user: null, accountType: null });
  });

  it("extracts user and account_type from session metadata", () => {
    const session = makeSession();
    const state = deriveAuthState(session);
    expect(state.session).toBe(session);
    expect(state.user?.id).toBe("user-1");
    expect(state.accountType).toBe("personal");
  });

  it("returns null accountType when metadata is missing", () => {
    const session = makeSession({ user_metadata: {} });
    expect(deriveAuthState(session).accountType).toBeNull();
  });
});

describe("hasAuthenticatedUser", () => {
  it("is true only when a user id exists", () => {
    expect(hasAuthenticatedUser(makeSession())).toBe(true);
    expect(hasAuthenticatedUser(null)).toBe(false);
  });
});
