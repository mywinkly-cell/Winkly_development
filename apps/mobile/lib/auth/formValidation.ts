// Pure signup/sign-in validation shared by auth screens — unit-testable.

export type SignupInput = {
  email: string;
  password: string;
  isAdult: boolean;
};

export type SigninInput = {
  email: string;
  password: string;
};

export type AuthFormErrorCode = "incomplete" | "password_too_short" | "confirm_18_required";

export type AuthFormValidationResult =
  | { ok: true; email: string }
  | { ok: false; code: AuthFormErrorCode };

const MIN_PASSWORD_LENGTH = 8;

export function validateSignupInput(input: SignupInput): AuthFormValidationResult {
  const email = input.email.trim();
  if (!email || !input.password) {
    return { ok: false, code: "incomplete" };
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, code: "password_too_short" };
  }
  if (!input.isAdult) {
    return { ok: false, code: "confirm_18_required" };
  }
  return { ok: true, email };
}

export function validateSigninInput(input: SigninInput): AuthFormValidationResult {
  const email = input.email.trim();
  if (!email || !input.password) {
    return { ok: false, code: "incomplete" };
  }
  return { ok: true, email };
}

/** True when Supabase reports an expired/invalid refresh token during sign-up/in. */
export function isInvalidRefreshToken(err: unknown): boolean {
  const msg = String((err as { message?: string } | null | undefined)?.message ?? "").toLowerCase();
  return msg.includes("refresh token") && (msg.includes("invalid") || msg.includes("not found"));
}

/** True when sign-up fails because the email is already registered. */
export function isExistingUserError(err: unknown): boolean {
  const msg = String((err as { message?: string } | null | undefined)?.message ?? err ?? "").toLowerCase();
  return (
    msg.includes("already registered") ||
    msg.includes("already exists") ||
    msg.includes("user already")
  );
}
