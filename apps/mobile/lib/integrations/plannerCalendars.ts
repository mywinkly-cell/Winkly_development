// apps/mobile/lib/integrations/plannerCalendars.ts
// One place for "this plan is on / off my calendars", used by every way a plan starts or
// ends for the user (made yourself, AI plan, chat invite accepted, event joined, group plan
// confirmed by others, cancelled, left).
//
// Two kinds of calendar:
//  • the phone's calendar (whatever accounts the phone has: iCloud, Google, Outlook,
//    Samsung…) — written on THIS device, only after the user opted in (Planner settings);
//  • connected cloud calendars (Google / Outlook via OAuth) — written server-side by
//    calendar-sync-confirmed-event, so they work even for plans other people confirmed.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";
import { t } from "i18next";
import { supabase } from "@/lib/supabase";
import { deleteEvent, requestCalendarPermissions } from "@/lib/integrations/calendar";
import {
  backfillPlannerItemsToDeviceCalendar,
  getCalendarSyncPreference,
  reconcileDeviceCalendar,
  setCalendarSyncPreference,
  syncPlannerItemToDeviceCalendar,
} from "@/lib/integrations/calendarSync";
import { ensureConfirmedEventForPlannerItem, triggerCloudCalendarSync } from "@/lib/integrations/confirmedEvents";

export type PlanCalendarInput = {
  plannerItemId: string;
  /** planner_items.created_by */
  creatorId: string;
  /** The signed-in user (whose calendars we write). */
  userId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt?: string | null;
};

/** Put a plan the user is committed to on their phone calendar and connected cloud calendars. */
export function addPlanToMyCalendars(input: PlanCalendarInput): void {
  void syncPlannerItemToDeviceCalendar({
    plannerItemId: input.plannerItemId,
    userId: input.userId,
    title: input.title,
    description: input.description ?? null,
    location: input.location ?? null,
    startsAt: input.startsAt,
    endsAt: input.endsAt ?? null,
  });
  void (async () => {
    const confirmedEventId = await ensureConfirmedEventForPlannerItem({
      plannerItemId: input.plannerItemId,
      creatorId: input.creatorId,
      participantUserId: input.userId,
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
    });
    if (confirmedEventId) await triggerCloudCalendarSync(confirmedEventId);
  })();
}

/**
 * Take a plan off the user's calendars (cancelled, left, not going). Cloud: the server removes
 * the caller's copies — or everyone's when the caller created the plan and cancelled it.
 * Call BEFORE deleting the user's planner_participants row (the device event id lives there).
 */
export async function removePlanFromMyCalendars(plannerItemId: string, userId: string): Promise<void> {
  try {
    const { data: part } = await supabase
      .from("planner_participants")
      .select("device_calendar_event_id")
      .eq("planner_item_id", plannerItemId)
      .eq("user_id", userId)
      .maybeSingle();
    const eventId = (part as { device_calendar_event_id?: string | null } | null)?.device_calendar_event_id;
    if (eventId) {
      await deleteEvent(eventId).catch(() => undefined);
      await supabase
        .from("planner_participants")
        .update({ device_calendar_event_id: null })
        .eq("planner_item_id", plannerItemId)
        .eq("user_id", userId);
    }
  } catch {
    // best-effort
  }
  try {
    const { data: ce } = await supabase
      .from("confirmed_events")
      .select("id")
      .eq("planner_item_id", plannerItemId)
      .maybeSingle();
    const confirmedEventId = (ce as { id?: string } | null)?.id;
    if (!confirmedEventId) return;
    const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const { data: { session } } = await supabase.auth.getSession();
    if (!SUPABASE_URL || !session?.access_token) return;
    await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/calendar-sync-confirmed-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ confirmed_event_id: confirmedEventId, action: "remove" }),
    });
  } catch {
    // best-effort
  }
}

/**
 * Catch-up for plans that reached the Planner from somewhere else (a group plan the others
 * confirmed, an invite accepted on another phone…): writes any upcoming plan the user is in
 * but that isn't on this phone's calendar yet, and re-writes / removes plans that were moved
 * or cancelled since (by anyone). Cheap no-op when sync is off.
 */
export function syncMissingPlansToThisPhone(userId: string): void {
  void (async () => {
    // First follow moves / cancellations made by others, then add what's missing.
    await reconcileDeviceCalendar(userId);
    await backfillPlannerItemsToDeviceCalendar(userId);
  })();
}

const ASKED_KEY = "winkly_calendar_sync_offer_asked";

/**
 * The first time a plan is added and phone-calendar sync is off, offer to switch it on
 * (it's opt-in for privacy). Asked once per device; the answer can be changed in Planner
 * settings, where Google / Outlook can also be connected.
 */
export async function offerCalendarSyncOnce(userId: string): Promise<void> {
  try {
    if (await getCalendarSyncPreference()) return;
    if ((await AsyncStorage.getItem(ASKED_KEY)) === "1") return;
    await AsyncStorage.setItem(ASKED_KEY, "1");
    // Let the screen's own confirmation ("You're going!", navigation to the Planner) show
    // first — two alerts at once can drop one on iOS.
    await new Promise((r) => setTimeout(r, 1500));
    Alert.alert(t("calendarOffer.title"), t("calendarOffer.body"), [
      { text: t("calendarOffer.notNow"), style: "cancel" },
      {
        text: t("calendarOffer.turnOn"),
        onPress: () => {
          void (async () => {
            const status = await requestCalendarPermissions();
            if (status !== "granted") return;
            await setCalendarSyncPreference(true);
            await backfillPlannerItemsToDeviceCalendar(userId);
          })();
        },
      },
    ]);
  } catch {
    // best-effort
  }
}
