import {
  isExistingUserError,
  isInvalidRefreshToken,
  validateSigninInput,
  validateSignupInput,
} from "@/lib/auth/formValidation";

describe("validateSignupInput", () => {
  it("rejects empty email or password", () => {
    expect(validateSignupInput({ email: "", password: "", isAdult: true })).toEqual({
      ok: false,
      title: "Incomplete",
      message: "Please enter email and password.",
    });
  });

  it("rejects passwords shorter than 8 characters", () => {
    expect(validateSignupInput({ email: "a@b.com", password: "short", isAdult: true })).toEqual({
      ok: false,
      title: "Password too short",
      message: "Use at least 8 characters.",
    });
  });

  it("requires 18+ confirmation", () => {
    expect(validateSignupInput({ email: "a@b.com", password: "longenough", isAdult: false })).toEqual({
      ok: false,
      title: "Confirmation required",
      message: "Please confirm you are 18 or older.",
    });
  });

  it("trims email and accepts valid input", () => {
    expect(validateSignupInput({ email: "  qa@winkly.test  ", password: "Test1234!", isAdult: true })).toEqual({
      ok: true,
      email: "qa@winkly.test",
    });
  });
});

describe("validateSigninInput", () => {
  it("rejects empty credentials", () => {
    expect(validateSigninInput({ email: " ", password: "" })).toEqual({
      ok: false,
      title: "Incomplete",
      message: "Please enter email and password.",
    });
  });

  it("trims email on success", () => {
    expect(validateSigninInput({ email: "  user@test.com ", password: "secret" })).toEqual({
      ok: true,
      email: "user@test.com",
    });
  });
});

describe("isInvalidRefreshToken", () => {
  it("detects invalid refresh token messages", () => {
    expect(isInvalidRefreshToken({ message: "Invalid Refresh Token: Not Found" })).toBe(true);
    expect(isInvalidRefreshToken({ message: "network request failed" })).toBe(false);
  });
});

describe("isExistingUserError", () => {
  it("detects already-registered errors", () => {
    expect(isExistingUserError({ message: "User already registered" })).toBe(true);
    expect(isExistingUserError({ message: "Invalid login credentials" })).toBe(false);
  });
});
