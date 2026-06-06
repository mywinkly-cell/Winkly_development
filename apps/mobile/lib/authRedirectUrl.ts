// Mint signed CSRF state for HTTPS auth-redirect flows (see supabase/functions/auth-redirect).

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getPublicEnv } from "@/lib/env";
import { httpGet } from "@/lib/http/client";

function authRedirectUrl(): string {
  return getPublicEnv().authRedirectUrl.trim();
}

const PENDING_STATE_KEY = "winkly_pending_auth_state";

function supabaseFunctionsBase(): string | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!url) return null;
  return `${url}/functions/v1`;
}

/** True when email links go through the HTTPS auth-redirect Edge Function. */
export function usesHttpsAuthRedirect(): boolean {
  const base = authRedirectUrl();
  return base.startsWith("http://") || base.startsWith("https://");
}

/**
 * emailRedirectTo for signUp / resetPassword / resend.
 * Appends signed winkly_state when using HTTPS auth-redirect and mint succeeds.
 */
export async function getEmailRedirectTo(): Promise<string> {
  const base = authRedirectUrl();
  if (!usesHttpsAuthRedirect()) return base;

  const fnBase = supabaseFunctionsBase();
  if (!fnBase) return base;

  try {
    const body = await httpGet<{ state?: string }>(`${fnBase}/auth-redirect?action=mint`);
    if (!body.state) return base;

    await AsyncStorage.setItem(PENDING_STATE_KEY, body.state);
    const u = new URL(base);
    u.searchParams.set("winkly_state", body.state);
    return u.toString();
  } catch {
    return base;
  }
}

/** Validate winkly_state on deep link callback (defense in depth with Edge Function). */
export async function validateAuthRedirectStateFromUrl(url: string): Promise<boolean> {
  if (!usesHttpsAuthRedirect()) return true;

  const qIndex = url.indexOf("?");
  const hashIndex = url.indexOf("#");
  const qEnd = hashIndex >= 0 ? hashIndex : url.length;
  const query = qIndex >= 0 ? url.slice(qIndex + 1, qEnd) : "";
  if (!query) return true;

  const state = query.split("&").reduce<string | null>((acc, part) => {
    const eq = part.indexOf("=");
    if (eq < 0) return acc;
    const k = decodeURIComponent(part.slice(0, eq));
    if (k === "winkly_state") {
      return decodeURIComponent(part.slice(eq + 1).replace(/\+/g, " "));
    }
    return acc;
  }, null);

  if (!state) return true;

  const pending = await AsyncStorage.getItem(PENDING_STATE_KEY);
  if (!pending || pending !== state) return false;

  await AsyncStorage.removeItem(PENDING_STATE_KEY);
  return true;
}
