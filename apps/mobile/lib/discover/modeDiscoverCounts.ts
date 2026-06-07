import { supabase } from "@/lib/supabase";
import type { Mode } from "@/types";

export type ModeDiscoverCounts = Partial<Record<Mode, number>>;

/** Lightweight discover-feed counts for mode-selection FOMO copy. */
export async function fetchModeDiscoverCounts(userId: string): Promise<ModeDiscoverCounts> {
  const counts: ModeDiscoverCounts = {};

  const [romanceRes, friendsRes, businessRes, eventsRes] = await Promise.all([
    supabase.rpc("romance_discover_feed_geo", {
      current_user_id: userId,
      p_max_distance_km: null,
      p_age_min: null,
      p_age_max: null,
      p_genders: null,
      p_limit: 200,
    }),
    supabase.rpc("friends_discover_feed", {
      current_user_id: userId,
      p_limit: 200,
    }),
    supabase.rpc("business_home_feed", {
      current_user_id: userId,
      p_limit: 200,
      p_query: null,
      p_role_type: null,
      p_networking_goal: null,
    }),
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .gte("start_at", new Date().toISOString()),
  ]);

  if (!romanceRes.error && Array.isArray(romanceRes.data)) {
    counts.romance = romanceRes.data.length;
  }
  if (!friendsRes.error && Array.isArray(friendsRes.data)) {
    counts.friends = friendsRes.data.length;
  }
  if (!businessRes.error && Array.isArray(businessRes.data)) {
    counts.business = businessRes.data.length;
  }
  if (!eventsRes.error && typeof eventsRes.count === "number") {
    counts.events = eventsRes.count;
  }

  return counts;
}

export function formatModeDiscoverCount(mode: Mode, count: number | undefined): string | null {
  if (count == null || count <= 0) return null;
  const noun =
    mode === "events"
      ? count === 1
        ? "event"
        : "events"
      : count === 1
        ? "person"
        : "people";
  const scope = mode === "events" ? "near you" : "near you";
  return `${count.toLocaleString()} ${noun} ${scope}`;
}
