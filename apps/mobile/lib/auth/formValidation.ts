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

export type AuthFormValidationResult =
  | { ok: true; email: string }
  | { ok: false; title: string; message: string };

const MIN_PASSWORD_LENGTH = 8;

export function validateSignupInput(input: SignupInput): AuthFormValidationResult {
  const email = input.email.trim();
  if (!email || !input.password) {
    return { ok: false, title: "Incomplete", message: "Please enter email and password." };
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, title: "Password too short", message: "Use at least 8 characters." };
  }
  if (!input.isAdult) {
    return { ok: false, title: "Confirmation required", message: "Please confirm you are 18 or older." };
  }
  return { ok: true, email };
}

export function validateSigninInput(input: SigninInput): AuthFormValidationResult {
  const email = input.email.trim();
  if (!email || !input.password) {
    return { ok: false, title: "Incomplete", message: "Please enter email and password." };
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
