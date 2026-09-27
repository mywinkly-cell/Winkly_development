/**
 * Two-step completion for the cloud calendar OAuth connect flow (SEC-10, Sept 2026 audit).
 *
 * calendar-oauth-callback is reached by a plain browser redirect from Google/Microsoft, so it
 * can only know who STARTED the flow (from the signed state), not who finished it. It therefore
 * parks the encrypted tokens under a one-time code (mintCompletionCode) that it hands only to
 * the browser session that completed consent. The app then calls
 * calendar-oauth-start?action=complete with that code and its own session, and
 * completeCalendarConnection activates the tokens only if the caller is the same user.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { syncConfirmedEventToCloud } from "./calendarSync.ts";

/** Pending rows older than this are rejected (and cleaned up on the next completion). */
const PENDING_TTL_MS = 10 * 60 * 1000;

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function hashCompletionCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 256-bit random code (returned to the browser) and its SHA-256 (the only thing stored). */
export async function mintCompletionCode(): Promise<{ code: string; hash: string }> {
  const code = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  return { code, hash: await hashCompletionCode(code) };
}

export type CompleteCalendarResult =
  | { ok: true; provider: "google" | "microsoft" }
  | { ok: false; status: number; error: string };

/**
 * Activates a parked connection for `uid`. Single use: the pending row is deleted whether or
 * not it belongs to the caller, so a leaked code can't be retried. Uses the service role.
 */
export async function completeCalendarConnection(
  admin: SupabaseClient,
  uid: string,
  code: unknown,
): Promise<CompleteCalendarResult> {
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{40,64}$/.test(code)) {
    return { ok: false, status: 400, error: "Invalid completion code" };
  }

  await admin
    .from("calendar_oauth_pending")
    .delete()
    .lt("created_at", new Date(Date.now() - PENDING_TTL_MS).toISOString());

  const { data: rows, error: takeErr } = await admin
    .from("calendar_oauth_pending")
    .delete()
    .eq("code_hash", await hashCompletionCode(code))
    .select("user_id, provider, token_encrypted, token_expires_at, scopes, created_at");
  if (takeErr) return { ok: false, status: 500, error: "Could not complete the connection" };

  const pending = (rows ?? [])[0] as {
    user_id: string;
    provider: "google" | "microsoft";
    token_encrypted: string;
    token_expires_at: string | null;
    scopes: string | null;
    created_at: string;
  } | undefined;

  if (!pending || Date.parse(pending.created_at) < Date.now() - PENDING_TTL_MS) {
    return { ok: false, status: 404, error: "This connection link is invalid or expired" };
  }
  if (pending.user_id !== uid) {
    console.warn("calendar OAuth completion: code belongs to a different user — rejected");
    return { ok: false, status: 403, error: "This connection belongs to a different account" };
  }

  const { error: upsertErr } = await admin.from("calendar_connections").upsert(
    {
      user_id: uid,
      provider: pending.provider,
      token_encrypted: pending.token_encrypted,
      token_expires_at: pending.token_expires_at,
      scopes: pending.scopes,
      last_sync_at: null,
    },
    { onConflict: "user_id,provider" },
  );
  if (upsertErr) {
    console.error("calendar OAuth completion upsert:", upsertErr);
    return { ok: false, status: 500, error: "Could not save the connection" };
  }

  // Backfill: sync this user's already-confirmed upcoming plans to the calendar they just
  // connected, so connecting later doesn't mean missing everything already on the Planner
  // (mirrors the device-calendar backfill-on-toggle in apps/mobile/lib/integrations/calendarSync.ts).
  try {
    const { data: parts } = await admin
      .from("planner_participants")
      .select("planner_item_id")
      .eq("user_id", uid)
      .in("role", ["owner", "attendee"]);
    const plannerItemIds = Array.from(new Set((parts ?? []).map((p: { planner_item_id: string }) => p.planner_item_id)));

    if (plannerItemIds.length > 0) {
      const { data: events } = await admin
        .from("confirmed_events")
        .select("id")
        .in("planner_item_id", plannerItemIds)
        .gte("starts_at", new Date().toISOString())
        .limit(20);
      for (const ev of events ?? []) {
        await syncConfirmedEventToCloud(admin, (ev as { id: string }).id);
      }
    }
  } catch (backfillErr) {
    console.warn("calendar OAuth completion backfill:", backfillErr);
  }

  return { ok: true, provider: pending.provider };
}
