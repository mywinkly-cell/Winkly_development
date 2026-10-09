// Server helpers shared by the /p/<token> page and its preview image (website/api/*).
// Reads the plan through the public get_shared_plan RPC with the anon key — the same, privacy-safe
// view the browser gets. Env (Vercel → Project → Settings → Environment Variables):
//   WINKLY_SUPABASE_URL        https://<project>.supabase.co
//   WINKLY_SUPABASE_ANON_KEY   the public anon / publishable key (never the service role key)
//   WINKLY_SITE_ORIGIN         optional, defaults to the request origin (e.g. https://mywinkly.de)
//   WINKLY_APP_STORE_URL       optional iOS App Store link for "Get the app"
//   WINKLY_PLAY_STORE_URL      optional, defaults to the Play listing of com.winkly.app

import { TOKEN_RE } from "./render.mjs";

export function readConfig(env = process.env) {
  return {
    supabaseUrl: env.WINKLY_SUPABASE_URL || env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || null,
    anonKey: env.WINKLY_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY || null,
    siteOrigin: env.WINKLY_SITE_ORIGIN || null,
    stores: {
      ios: env.WINKLY_APP_STORE_URL || null,
      android: env.WINKLY_PLAY_STORE_URL || "https://play.google.com/store/apps/details?id=com.winkly.app",
    },
  };
}

function authHeaders(anonKey) {
  const headers = { apikey: anonKey, "Content-Type": "application/json" };
  // Legacy anon keys are JWTs and also go in Authorization; new publishable keys don't.
  if (anonKey.split(".").length === 3) headers.Authorization = `Bearer ${anonKey}`;
  return headers;
}

/** get_shared_plan(token) → { status, plan? }. Never throws; network trouble → { status: "error" }. */
export async function fetchSharedPlan(token, config, fetchImpl = fetch) {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return { status: "not_found" };
  if (!config.supabaseUrl || !config.anonKey) return { status: "error" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetchImpl(`${config.supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/get_shared_plan`, {
      method: "POST",
      headers: authHeaders(config.anonKey),
      body: JSON.stringify({ p_token: token }),
      signal: controller.signal,
    });
    if (!res.ok) return { status: "error" };
    const data = await res.json();
    return data && typeof data.status === "string" ? data : { status: "error" };
  } catch {
    return { status: "error" };
  } finally {
    clearTimeout(timer);
  }
}

/** Public origin for absolute links (OG tags need absolute URLs). */
export function siteOrigin(request, config) {
  if (config.siteOrigin) return config.siteOrigin.replace(/\/+$/, "");
  return new URL(request.url).origin;
}
