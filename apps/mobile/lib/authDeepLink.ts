// lib/authDeepLink.ts
// Parse auth tokens from deep link URL and establish session (Supabase native mobile deep linking)
//
// REQUIRED: Add these to Supabase Dashboard → Auth → URL Configuration → Redirect URLs:
//   - winkly://callback
//   - winkly://**
//
// If the email link opens in a browser and shows an empty page: host auth-redirect/index.html
// at an HTTPS URL (e.g. https://winkly.app/auth/) and use that as emailRedirectTo.

import * as QueryParams from "expo-auth-session/build/QueryParams";
import { supabase } from "@/lib/supabase";

const AUTH_CALLBACK_PATH = "winkly://callback";

export { AUTH_CALLBACK_PATH };

/**
 * Parse URL from email link (verification, magic link, password reset) and set session.
 * Returns session if successful, or null.
 */
export async function createSessionFromUrl(url: string): Promise<boolean> {
  try {
    const { params, errorCode } = QueryParams.getQueryParams(url);
    if (errorCode) {
      console.warn("authDeepLink: error in URL", errorCode);
      return false;
    }

    const access_token = params.access_token;
    const refresh_token = params.refresh_token;

    if (!access_token) {
      return false;
    }

    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token: refresh_token ?? "",
    });

    if (error) {
      console.warn("authDeepLink: setSession error", error);
      return false;
    }

    return true;
  } catch (err) {
    console.warn("authDeepLink: createSessionFromUrl error", err);
    return false;
  }
}

/** Check if URL is a recovery (password reset) link */
export function isRecoveryUrl(url: string): boolean {
  try {
    const { params } = QueryParams.getQueryParams(url);
    return params.type === "recovery";
  } catch {
    return false;
  }
}
