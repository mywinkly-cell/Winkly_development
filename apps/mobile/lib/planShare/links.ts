// apps/mobile/lib/planShare/links.ts
// Pure helpers for shareable plan links (mywinkly.de/p/<token>). See docs/PLAN_SHARING.md.

import { formatAppDate, formatAppTime } from "@/lib/i18n/appLocale";

/** Public website that serves the "I'm in" page (website/api/plan.mjs). */
export const PLAN_SHARE_ORIGIN = "https://mywinkly.de";

/** Same shape the database issues (24 URL-safe chars) and accepts (20–64). */
export const PLAN_SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

/** Where "Share plan" was tapped — the plan_shared analytics `source`. */
export type PlanShareSource = "planner_card" | "planner_details" | "weekly_spark";

export function isPlanShareToken(value: unknown): value is string {
  return typeof value === "string" && PLAN_SHARE_TOKEN_RE.test(value);
}

export function planShareUrl(token: string, origin: string = PLAN_SHARE_ORIGIN): string {
  return `${origin.replace(/\/+$/, "")}/p/${encodeURIComponent(token)}`;
}

/** Token from the path after https://mywinkly.de/app/ — ["p", "<token>"] → "<token>". */
export function planShareTokenFromSegments(segments: readonly string[]): string | null {
  if (segments.length !== 2 || segments[0] !== "p") return null;
  return isPlanShareToken(segments[1]) ? segments[1] : null;
}

/** "Sat, 12 Oct · 19:00" in the app language; null for a missing/invalid date. */
export function formatPlanShareWhen(startsAt: string | Date | null | undefined, locale?: string): string | null {
  if (!startsAt) return null;
  const d = startsAt instanceof Date ? startsAt : new Date(startsAt);
  if (Number.isNaN(d.getTime())) return null;
  const day = formatAppDate(d, { weekday: "short", day: "numeric", month: "short" }, locale);
  const time = formatAppTime(d, undefined, locale);
  return `${day} · ${time}`;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Prefilled (editable) share-sheet text: "I planned something for us 😄 {title} · {when}. You in? {link}". */
export function buildPlanShareMessage(
  t: Translate,
  p: { title: string; when: string | null; url: string },
): string {
  return p.when
    ? t("planShare.message", { title: p.title, when: p.when, url: p.url })
    : t("planShare.messageNoWhen", { title: p.title, url: p.url });
}

/** The device's IANA time zone, so the web page shows the plan in the host's local time. */
export function deviceTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === "string" && /^[A-Za-z0-9_+/-]{1,64}$/.test(zone) ? zone : null;
  } catch {
    return null;
  }
}

const SIGNUP_FROM_SHARE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** A share conversion within a day of the account being created counts as a signup from the share. */
export function isRecentSignup(userCreatedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!userCreatedAt) return false;
  const created = new Date(userCreatedAt).getTime();
  if (Number.isNaN(created)) return false;
  return now.getTime() - created <= SIGNUP_FROM_SHARE_WINDOW_MS;
}
