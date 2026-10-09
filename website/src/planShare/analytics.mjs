// Cookieless, anonymous product analytics for the shared-plan page.
// The web page has no consent banner, so nothing here identifies a visitor: no cookies, no
// stored ids, no IP (PostHog only sees the Vercel server), a fresh random distinct_id per event and
// person profiles off. The share token is never sent (it's a bearer secret). Disabled unless
// WINKLY_POSTHOG_KEY is set. Event names match apps/mobile/lib/analytics/events.ts.

import { randomUUID } from "node:crypto";

export const WEB_EVENTS = ["share_link_opened", "web_rsvp_submitted"];
export const WEB_EVENT_LANGS = ["en", "de"];

/** Validate a beacon body → { event, lang } or null. */
export function parseWebEvent(raw) {
  let data;
  try {
    data = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!data || !WEB_EVENTS.includes(data.event)) return null;
  return { event: data.event, lang: WEB_EVENT_LANGS.includes(data.lang) ? data.lang : "other" };
}

export function posthogPayload({ event, lang }, apiKey) {
  return {
    api_key: apiKey,
    event,
    distinct_id: `web_${randomUUID()}`,
    properties: { surface: "web", lang, $process_person_profile: false, $ip: null },
  };
}

export async function captureWebEvent(parsed, env = process.env, fetchImpl = fetch) {
  const apiKey = env.WINKLY_POSTHOG_KEY;
  if (!apiKey || !parsed) return false;
  const host = (env.WINKLY_POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetchImpl(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(posthogPayload(parsed, apiKey)),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
