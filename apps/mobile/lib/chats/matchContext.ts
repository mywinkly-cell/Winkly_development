/**
 * Romance match DM context bar — shared interests + distance for new match threads.
 */

import i18n from "i18next";
import { supabase } from "@/lib/supabase";
import { getCompatibilityScore } from "@/lib/ai/compatibilityLayer";
import { formatDistance } from "@/lib/distanceUnit";

/** Localized label for a compatibility proximity bucket (distance in the user's unit). */
function proximityLabel(bucket: string): string | null {
  switch (bucket) {
    case "very_near":
      return formatDistance(2, Infinity);
    case "near":
      return formatDistance(5, Infinity);
    case "same_city":
      return i18n.t("common.sameCity");
    case "regional":
      return i18n.t("chat.matchContext.nearby");
    case "far":
      return i18n.t("chat.matchContext.furtherAway");
    default:
      return null;
  }
}

function intersect(a?: string[] | null, b?: string[] | null): string[] {
  if (!a?.length || !b?.length) return [];
  const setB = new Set(b.map((x) => x.toLowerCase()));
  return a.filter((x) => setB.has(x.toLowerCase()));
}

export type RomanceMatchContext = {
  sharedInterestCount: number;
  distanceLabel: string | null;
};

export async function loadRomanceMatchContext(
  myUserId: string,
  partnerUserId: string
): Promise<RomanceMatchContext> {
  const [compat, profiles] = await Promise.all([
    getCompatibilityScore(myUserId, partnerUserId, "romance"),
    Promise.all([
      supabase.from("profiles_mode").select("interests").eq("user_id", myUserId).eq("mode", "romance").maybeSingle(),
      supabase.from("profiles_mode").select("interests").eq("user_id", partnerUserId).eq("mode", "romance").maybeSingle(),
    ]),
  ]);

  const myInterests = (profiles[0].data?.interests as string[] | null) ?? [];
  const theirInterests = (profiles[1].data?.interests as string[] | null) ?? [];
  const sharedFromProfiles = intersect(myInterests, theirInterests);
  const sharedFromCompat = compat?.shared_interest_tags ?? [];
  const sharedInterestCount = Math.max(sharedFromProfiles.length, sharedFromCompat.length);

  let distanceLabel: string | null = null;
  if (compat?.location_proximity_bucket) {
    distanceLabel = proximityLabel(compat.location_proximity_bucket);
  }
  if (!distanceLabel) {
    const [{ data: me }, { data: them }] = await Promise.all([
      supabase.from("user_profiles").select("city").eq("id", myUserId).maybeSingle(),
      supabase.from("user_profiles").select("city").eq("id", partnerUserId).maybeSingle(),
    ]);
    const myCity = (me as { city?: string } | null)?.city?.split(",")[0]?.trim().toLowerCase();
    const theirCity = (them as { city?: string } | null)?.city?.split(",")[0]?.trim().toLowerCase();
    if (myCity && theirCity && myCity === theirCity) distanceLabel = i18n.t("common.sameCity");
  }

  return { sharedInterestCount, distanceLabel };
}
