/**
 * Romance match DM context bar — shared interests + distance for new match threads.
 */

import { supabase } from "@/lib/supabase";
import { getCompatibilityScore } from "@/lib/ai/compatibilityLayer";

const PROXIMITY_LABELS: Record<string, string> = {
  very_near: "~2 km away",
  near: "~5 km away",
  same_city: "Same city",
  regional: "Nearby",
  far: "Further away",
};

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
    distanceLabel = PROXIMITY_LABELS[compat.location_proximity_bucket] ?? null;
  }
  if (!distanceLabel) {
    const [{ data: me }, { data: them }] = await Promise.all([
      supabase.from("user_profiles").select("city").eq("id", myUserId).maybeSingle(),
      supabase.from("user_profiles").select("city").eq("id", partnerUserId).maybeSingle(),
    ]);
    const myCity = (me as { city?: string } | null)?.city?.split(",")[0]?.trim().toLowerCase();
    const theirCity = (them as { city?: string } | null)?.city?.split(",")[0]?.trim().toLowerCase();
    if (myCity && theirCity && myCity === theirCity) distanceLabel = "Same city";
  }

  return { sharedInterestCount, distanceLabel };
}
