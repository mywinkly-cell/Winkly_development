/**
 * Core "sync one confirmed plan to every connected cloud calendar" logic. Shared by the
 * on-demand calendar-sync-confirmed-event function (called right after a plan is confirmed)
 * and the calendar-sync-sweep cron (retries anything left 'pending'/'failed'), so there is
 * exactly one implementation of the sync itself.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptCalendarTokens, encryptCalendarTokens } from "./calendarTokenCrypto.ts";
import { createGoogleCalendarEvent, refreshGoogleAccessToken } from "./googleCalendar.ts";
import { createMicrosoftCalendarEvent, refreshMicrosoftAccessToken } from "./microsoftGraph.ts";

type CalendarConnectionRow = {
  user_id: string;
  provider: "google" | "microsoft";
  token_encrypted: string | null;
  token_expires_at: string | null;
};

/** Extracts a best-guess location string from a planner_items.meta blob (mirrors the mobile-side helper). */
function deriveLocationText(meta: Record<string, unknown> | null): string | undefined {
  if (!meta) return undefined;
  const loc = meta.location ?? meta.place ?? meta.venue_name;
  return typeof loc === "string" && loc ? loc : undefined;
}

export type { CalendarConnectionRow };

/** Returns a valid (non-expired) access token, refreshing + re-persisting it if needed. Null on failure. */
export async function getValidAccessToken(supabase: SupabaseClient, conn: CalendarConnectionRow): Promise<string | null> {
  const tokens = await decryptCalendarTokens(conn.token_encrypted, conn.user_id);
  if (!tokens) return null;

  const expiresAt = conn.token_expires_at ? Date.parse(conn.token_expires_at) : 0;
  const stillValid = Number.isFinite(expiresAt) && expiresAt > Date.now() + 2 * 60 * 1000;
  if (stillValid) return tokens.access_token;

  const refreshed = conn.provider === "google"
    ? await refreshGoogleAccessToken(tokens.refresh_token)
    : await refreshMicrosoftAccessToken(tokens.refresh_token);
  if (!refreshed) return null;

  const encrypted = await encryptCalendarTokens({ access_token: refreshed.access_token, refresh_token: tokens.refresh_token }, conn.user_id);
  if (encrypted) {
    await supabase
      .from("calendar_connections")
      .update({
        token_encrypted: encrypted,
        token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      })
      .eq("user_id", conn.user_id)
      .eq("provider", conn.provider);
  }

  return refreshed.access_token;
}

export type SyncConfirmedEventResult = { synced: number; failed: number; skipped: number };

/**
 * Syncs one confirmed_events row to every connected provider of every participant who
 * doesn't already have a synced copy. Best-effort per participant/provider — one failure
 * never blocks the others; failures are recorded with sync_status='failed' so the cron
 * sweep retries them later.
 */
export async function syncConfirmedEventToCloud(
  supabase: SupabaseClient,
  confirmedEventId: string,
): Promise<SyncConfirmedEventResult> {
  const result: SyncConfirmedEventResult = { synced: 0, failed: 0, skipped: 0 };

  const { data: ce } = await supabase
    .from("confirmed_events")
    .select("id, title, starts_at, ends_at, planner_item_id")
    .eq("id", confirmedEventId)
    .maybeSingle();
  if (!ce) return result;

  const { data: plannerItem } = ce.planner_item_id
    ? await supabase.from("planner_items").select("description, meta").eq("id", ce.planner_item_id).maybeSingle()
    : { data: null };

  const description = (plannerItem as { description?: string | null } | null)?.description ?? undefined;
  const location = deriveLocationText((plannerItem as { meta?: Record<string, unknown> | null } | null)?.meta ?? null);

  const { data: participants } = ce.planner_item_id
    ? await supabase
      .from("planner_participants")
      .select("user_id")
      .eq("planner_item_id", ce.planner_item_id)
      .in("role", ["owner", "attendee"])
    : { data: null };
  const userIds = Array.from(new Set((participants ?? []).map((p: { user_id: string }) => p.user_id)));
  if (userIds.length === 0) return result;

  const { data: connections } = await supabase
    .from("calendar_connections")
    .select("user_id, provider, token_encrypted, token_expires_at")
    .in("user_id", userIds)
    .in("provider", ["google", "microsoft"]);
  if (!connections?.length) return result;

  const { data: existingParticipantRows } = await supabase
    .from("confirmed_event_participants")
    .select("user_id, provider, sync_status")
    .eq("confirmed_event_id", confirmedEventId);
  const alreadySynced = new Set(
    (existingParticipantRows ?? [])
      .filter((r: { sync_status: string }) => r.sync_status === "synced")
      .map((r: { user_id: string; provider: string }) => `${r.user_id}:${r.provider}`),
  );

  for (const conn of connections as CalendarConnectionRow[]) {
    const key = `${conn.user_id}:${conn.provider}`;
    if (alreadySynced.has(key)) {
      result.skipped++;
      continue;
    }

    try {
      const accessToken = await getValidAccessToken(supabase, conn);
      if (!accessToken) throw new Error("Could not obtain a valid access token");

      const created = conn.provider === "google"
        ? await createGoogleCalendarEvent(accessToken, { title: ce.title, description, location, startIso: ce.starts_at, endIso: ce.ends_at ?? ce.starts_at })
        : await createMicrosoftCalendarEvent(accessToken, { title: ce.title, description, location, startIso: ce.starts_at, endIso: ce.ends_at ?? ce.starts_at });

      if (!created) throw new Error("Provider event creation failed");

      await supabase.from("confirmed_event_participants").upsert(
        {
          confirmed_event_id: confirmedEventId,
          user_id: conn.user_id,
          provider: conn.provider,
          external_event_id: created.externalEventId,
          calendar_id: created.calendarId,
          sync_status: "synced",
          synced_at: new Date().toISOString(),
          sync_error: null,
        },
        { onConflict: "confirmed_event_id,user_id,provider" },
      );
      result.synced++;
    } catch (e) {
      await supabase.from("confirmed_event_participants").upsert(
        {
          confirmed_event_id: confirmedEventId,
          user_id: conn.user_id,
          provider: conn.provider,
          sync_status: "failed",
          sync_error: e instanceof Error ? e.message : "Unknown error",
        },
        { onConflict: "confirmed_event_id,user_id,provider" },
      );
      result.failed++;
    }
  }

  await supabase.from("calendar_connections").update({ last_sync_at: new Date().toISOString() }).in(
    "user_id",
    (connections as CalendarConnectionRow[]).map((c) => c.user_id),
  );

  return result;
}
