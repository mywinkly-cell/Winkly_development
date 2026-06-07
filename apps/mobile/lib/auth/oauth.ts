// apps/mobile/lib/auth/oauth.ts
// Google (Supabase OAuth + WebBrowser) and Apple (native + signInWithIdToken).

import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import { supabase } from "@/lib/supabase";
import { createSessionFromUrl, AUTH_CALLBACK_PATH } from "@/lib/authDeepLink";
import { isAppleSignInAvailable, signInWithApple } from "@/lib/integrations/socials";
import { getOAuthConfig } from "@/lib/env";

WebBrowser.maybeCompleteAuthSession();

export type OAuthProviderName = "google" | "apple";

export type OAuthSignInResult =
  | { ok: true }
  | { ok: false; reason: "cancelled" | "not_configured" | "unavailable" | "failed"; message?: string };

function getOAuthRedirectUri(): string {
  return AuthSession.makeRedirectUri({
    scheme: "winkly",
    path: "callback",
  });
}

export function isGoogleSignInConfigured(): boolean {
  const cfg = getOAuthConfig();
  if (Platform.OS === "android") return cfg.googleAndroidClientId.length > 0;
  if (Platform.OS === "ios") return cfg.googleIosClientId.length > 0;
  return cfg.googleAndroidClientId.length > 0 || cfg.googleIosClientId.length > 0;
}

export async function isAppleSignInConfigured(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  return isAppleSignInAvailable();
}

export async function signInWithGoogleOAuth(
  metadata?: Record<string, string>
): Promise<OAuthSignInResult> {
  const cfg = getOAuthConfig();
  const redirectTo = getOAuthRedirectUri();
  const clientId =
    Platform.OS === "ios"
      ? cfg.googleIosClientId || cfg.googleAndroidClientId
      : cfg.googleAndroidClientId || cfg.googleIosClientId;

  const queryParams: Record<string, string> = {
    access_type: "offline",
    prompt: "consent",
  };
  if (clientId) queryParams.client_id = clientId;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams,
      ...(metadata ? { data: metadata } : {}),
    },
  });

  if (error) {
    return { ok: false, reason: "failed", message: error.message };
  }
  if (!data?.url) {
    return { ok: false, reason: "not_configured", message: "Google OAuth URL missing. Configure Google in Supabase Auth." };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
    showInRecents: true,
  });

  if (result.type === "cancel" || result.type === "dismiss") {
    return { ok: false, reason: "cancelled" };
  }
  if (result.type !== "success" || !result.url) {
    return { ok: false, reason: "failed", message: "Google sign-in did not complete." };
  }

  const sessionOk = await createSessionFromUrl(result.url);
  if (!sessionOk) {
    // Fallback: fragment may land on winkly://callback without winkly_state from email CSRF flow.
    const normalized =
      result.url.includes("#") && !result.url.startsWith("winkly://")
        ? `${AUTH_CALLBACK_PATH}#${result.url.slice(result.url.indexOf("#") + 1)}`
        : result.url;
    const retry = await createSessionFromUrl(normalized);
    if (!retry) {
      return { ok: false, reason: "failed", message: "Could not establish session from Google redirect." };
    }
  }

  if (metadata) {
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user && !userData.user.user_metadata?.account_type) {
      await supabase.auth.updateUser({ data: metadata });
    }
  }

  return { ok: true };
}

export async function signInWithAppleOAuth(
  metadata?: Record<string, string>
): Promise<OAuthSignInResult> {
  const available = await isAppleSignInConfigured();
  if (!available) {
    return { ok: false, reason: "unavailable", message: "Sign in with Apple is not available on this device." };
  }

  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  const apple = await signInWithApple(hashedNonce);
  if (!apple.ok) {
    if (apple.reason === "cancelled") return { ok: false, reason: "cancelled" };
    if (apple.reason === "unavailable") return { ok: false, reason: "unavailable", message: apple.message };
    return { ok: false, reason: "failed", message: apple.message ?? "Apple sign-in failed." };
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: apple.idToken,
    nonce: rawNonce,
  });

  if (error) {
    return { ok: false, reason: "failed", message: error.message };
  }

  if (metadata) {
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user && !userData.user.user_metadata?.account_type) {
      await supabase.auth.updateUser({ data: metadata });
    }
  }

  return { ok: true };
}
