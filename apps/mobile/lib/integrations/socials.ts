// apps/mobile/lib/integrations/socials.ts
// Social login helpers (Apple + generic OAuth via AuthSession).

import * as AppleAuthentication from "expo-apple-authentication";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

export type AppleSignInResult =
  | { ok: true; idToken: string; nonce?: string | null; email?: string | null; fullName?: AppleAuthentication.AppleAuthenticationFullName | null }
  | { ok: false; reason: "unavailable" | "cancelled" | "failed"; message?: string };

export async function isAppleSignInAvailable() {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple(): Promise<AppleSignInResult> {
  const available = await isAppleSignInAvailable();
  if (!available) return { ok: false, reason: "unavailable" };

  try {
    const res = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!res.identityToken) {
      return { ok: false, reason: "failed", message: "Missing Apple identity token." };
    }

    return {
      ok: true,
      idToken: res.identityToken,
      nonce: (res as unknown as { nonce?: string | null }).nonce,
      email: res.email,
      fullName: res.fullName,
    };
  } catch (err: any) {
    if (err?.code === "ERR_REQUEST_CANCELED" || err?.code === "ERR_CANCELED" || err?.message?.includes("canceled")) {
      return { ok: false, reason: "cancelled" };
    }
    return { ok: false, reason: "failed", message: String(err?.message ?? err) };
  }
}

export type OAuthProvider = "google" | "facebook" | "github" | "custom";

export type OAuthStartParams = {
  provider: OAuthProvider;
  /** Authorization endpoint URL */
  authorizationEndpoint: string;
  /** OAuth client id */
  clientId: string;
  /** Optional redirect URI; defaults to AuthSession default */
  redirectUri?: string;
  /** Optional extra params (scope, audience, etc.) */
  extraParams?: Record<string, string>;
};

export type OAuthStartResult =
  | { ok: true; code: string; redirectUri: string }
  | { ok: false; reason: "cancelled" | "failed"; message?: string };

export async function startOAuthAuthorizationCodeFlow(params: OAuthStartParams): Promise<OAuthStartResult> {
  try {
    const redirectUri = params.redirectUri ?? AuthSession.makeRedirectUri();

    const request = new AuthSession.AuthRequest({
      clientId: params.clientId,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: params.extraParams,
    });

    await request.makeAuthUrlAsync({ authorizationEndpoint: params.authorizationEndpoint });
    const result = await request.promptAsync({ authorizationEndpoint: params.authorizationEndpoint });

    if (result.type === "dismiss" || result.type === "cancel") return { ok: false, reason: "cancelled" };
    if (result.type !== "success") return { ok: false, reason: "failed", message: "OAuth flow failed." };

    const code = (result.params as any)?.code as string | undefined;
    if (!code) return { ok: false, reason: "failed", message: "Missing OAuth code." };

    return { ok: true, code, redirectUri };
  } catch (err: any) {
    return { ok: false, reason: "failed", message: String(err?.message ?? err) };
  }
}

