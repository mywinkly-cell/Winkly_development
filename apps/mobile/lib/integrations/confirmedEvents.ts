// apps/mobile/lib/integrations/confirmedEvents.ts
// Confirmed-event bookkeeping for cloud calendar sync. Mirrors what
// supabase/functions/pending-plan-confirm/index.ts already does for AI-Concierge group
// plans (create a canonical confirmed_events row + one confirmed_event_participants row
// per committed participant), but reusable from the client for the simpler planner flows
// (self-add, chat invite, external event) so cloud sync covers every way a plan gets
// confirmed, not just AI-Concierge ones.

import { supabase } from "@/lib/supabase";

export type EnsureConfirmedEventInput = {
  plannerItemId: string;
  /** planner_items.created_by — only the creator can insert the parent confirmed_events row (RLS). */
  creatorId: string;
  /** The current caller's own user id — the only id RLS allows them to insert a participant row for. */
  participantUserId: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
};

/**
 * Idempotent: finds the confirmed_events row for this planner item (creating it if the
 * caller is the creator and it doesn't exist yet), then upserts the caller's own
 * confirmed_event_participants placeholder row. Best-effort — returns null and never
 * throws, since this must not block the planner flow it's called from.
 */
export async function ensureConfirmedEventForPlannerItem(input: EnsureConfirmedEventInput): Promise<string | null> {
  try {
    const { data: existing } = await supabase
      .from("confirmed_events")
      .select("id")
      .eq("planner_item_id", input.plannerItemId)
      .maybeSingle();

    let confirmedEventId = (existing as { id?: string } | null)?.id ?? null;

    if (!confirmedEventId) {
      // Only the creator can insert the parent row (RLS: confirmed_events_insert requires auth.uid() = created_by).
      // If someone else calls this before the creator has, there's nothing to attach to yet — skip.
      if (input.participantUserId !== input.creatorId) return null;

      const { data: created, error } = await supabase
        .from("confirmed_events")
        .insert({
          created_by: input.creatorId,
          planner_item_id: input.plannerItemId,
          event_uid: `winkly:${input.plannerItemId}`,
          starts_at: input.startsAt,
          ends_at: input.endsAt ?? null,
          title: input.title,
        })
        .select("id")
        .single();
      if (error || !created) return null;
      confirmedEventId = created.id;
    }

    // 'winkly' is a placeholder row (no external provider yet) — cloud sync adds real
    // 'google'/'microsoft' rows alongside it once calendar-sync-confirmed-event runs.
    await supabase.from("confirmed_event_participants").upsert(
      {
        confirmed_event_id: confirmedEventId,
        user_id: input.participantUserId,
        provider: "winkly",
        sync_status: "pending",
      },
      { onConflict: "confirmed_event_id,user_id,provider" },
    );

    return confirmedEventId;
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget: asks calendar-sync-confirmed-event to sync this plan to every connected
 * cloud calendar right now. Never blocks or throws — the calendar-sync-sweep cron (Phase 2)
 * retries anything this call doesn't complete (offline device, transient provider error, etc).
 */
export async function triggerCloudCalendarSync(confirmedEventId: string): Promise<void> {
  try {
    const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!SUPABASE_URL) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/calendar-sync-confirmed-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ confirmed_event_id: confirmedEventId }),
    });
  } catch {
    // Best-effort — see doc comment above.
  }
}
