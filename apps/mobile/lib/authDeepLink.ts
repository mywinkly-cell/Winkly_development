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

/** Parse fragment or query string into key-value params (supports both # and ?) */
function getParamsFromUrl(url: string): Record<string, string> {
  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");
  const fragment = hashIndex >= 0 ? url.slice(hashIndex + 1) : "";
  const query = queryIndex >= 0 ? url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined) : "";
  const combined = [fragment, query].filter(Boolean).join("&");
  if (!combined) return {};
  return combined.split("&").reduce<Record<string, string>>((acc, part) => {
    const eq = part.indexOf("=");
    if (eq < 0) return acc;
    const key = decodeURIComponent(part.slice(0, eq).replace(/\+/g, " "));
    const value = decodeURIComponent(part.slice(eq + 1).replace(/\+/g, " "));
    if (key && value) acc[key] = value;
    return acc;
  }, {});
}

/**
 * Parse URL from email link (verification, magic link, password reset) and set session.
 * Supports:
 * 1) Redirect URL with fragment: winkly://callback#access_token=...&refresh_token=...&type=recovery
 * 2) Initial reset link with query: https://.../auth/v1/verify?token=...&type=recovery (uses verifyOtp)
 * Returns true if session was established.
 */
export async function createSessionFromUrl(url: string): Promise<boolean> {
  try {
    // Normalize: if URL has fragment but wrong scheme (e.g. https after redirect), use callback path for fragment so setSession works
    const urlToParse = url.includes("#") ? (url.startsWith("winkly://") ? url : "winkly://callback#" + url.slice(url.indexOf("#") + 1)) : url;
    const { params, errorCode } = QueryParams.getQueryParams(urlToParse);
    const fromFragment = params.access_token != null;

    if (fromFragment && !errorCode) {
      const access_token = params.access_token;
      const refresh_token = params.refresh_token;
      if (access_token) {
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token: refresh_token ?? "",
        });
        if (error) {
          console.warn("authDeepLink: setSession error", error);
          return false;
        }
        return true;
      }
    }

    // Try recovery token from query (initial email link, e.g. when pasted in Expo Go / dev)
    const queryParams = getParamsFromUrl(url);
    const token = queryParams.token ?? queryParams.token_hash;
    const type = queryParams.type;
    if (token && type === "recovery") {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: "recovery",
      });
      if (error) {
        console.warn("authDeepLink: verifyOtp error", error);
        return false;
      }
      if (data?.session) return true;
    }

    return false;
  } catch (err) {
    console.warn("authDeepLink: createSessionFromUrl error", err);
    return false;
  }
}

/** Check if URL is a recovery (password reset) link (fragment or query) */
export function isRecoveryUrl(url: string): boolean {
  try {
    const normalized = url.includes("#") ? "winkly://callback#" + url.slice(url.indexOf("#") + 1) : url;
    const { params } = QueryParams.getQueryParams(normalized);
    if (params.type === "recovery") return true;
    const fromQuery = getParamsFromUrl(url);
    return fromQuery.type === "recovery";
  } catch {
    return false;
  }
}
