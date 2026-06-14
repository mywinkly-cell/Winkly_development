import { supabase } from "@/lib/supabase";
import {
  computeCompatibilityScore,
  type RomanceProfile,
} from "@/lib/ai/romanceInsights";
import {
  getRomanceAiMatchingEnabled,
  getRomanceFilters,
  applyRomanceFiltersToFeed,
  hasSavedRomanceFilters,
  lookingForToGenders,
} from "@/lib/filters/romanceFiltersStorage";
import { combinedMatchScore, fetchBehaviorAffinityMap } from "@/lib/matching/behaviorAffinities";
import { getBlockedUserIdSet } from "@/lib/access/blocks";
import { modeDisplayName } from "@/lib/profile/otherUserCore";

export type RomanceSwipeCardProfile = {
  id: string;
  name: string;
  age: number;
  city: string;
  occupation?: string | null;
  chipItems: string[];
  /** Subset of chipItems shared with the viewer — highlighted on the card. */
  highlightChips?: string[];
  photoUrl: string;
  photoUrls: string[];
  /** Rounded, privacy-safe distance label from the server (e.g. "~3 km away"). */
  distanceLabel?: string | null;
};

/** Reorder another user's interests so shared ones come first; return the shared subset too. */
function orderSharedFirst(
  interests: string[],
  selfInterests: string[] | undefined
): { ordered: string[]; shared: string[] } {
  const selfSet = new Set((selfInterests ?? []).map((s) => s.trim().toLowerCase()));
  const shared: string[] = [];
  const rest: string[] = [];
  for (const i of interests) {
    if (selfSet.has(i.trim().toLowerCase())) shared.push(i);
    else rest.push(i);
  }
  return { ordered: [...shared, ...rest], shared };
}

type FeedRow = {
  id: string;
  first_name: string;
  age?: number | null;
  city?: string | null;
  interests?: string[] | null;
  languages?: string[] | null;
  occupation?: string | null;
  bio_romance?: string | null;
  compatibility?: number | null;
  romance_photos?: (string | null)[];
  core_photos?: (string | null)[];
  romance_interests?: (string | null)[];
  distance_km?: number | null;
  distance_label?: string | null;
};

const DISTANCE_KM_ANY = 999;

function collectPhotoUrls(
  romancePhotos?: (string | null)[] | null,
  corePhotos?: (string | null)[] | null,
): string[] {
  const romance = (romancePhotos ?? []).filter((p): p is string => !!p && String(p).trim() !== "");
  const source = romance.length
    ? romance
    : (corePhotos ?? []).filter((p): p is string => !!p && String(p).trim() !== "");
  return source.slice(0, 6);
}

/**
 * Romance home swipe deck — same feed rules as Discover recommendations (RPC + filters + AI sort).
 */
export async function fetchRomanceSwipeDeckProfiles(
  authedUserId: string,
  self: RomanceProfile | null,
): Promise<RomanceSwipeCardProfile[]> {
  const blocked = await getBlockedUserIdSet(authedUserId);
  const filters = await getRomanceFilters();

  // Distance / age / gender are filtered server-side (PostGIS); the server
  // returns only a rounded distance label, never raw coordinates.
  const maxDistanceKm =
    filters.distanceKm && filters.distanceKm !== DISTANCE_KM_ANY ? filters.distanceKm : null;

  // Gender preference: explicit filter wins. If the user hasn't customised
  // filters yet, fall back to their onboarding "looking for" preference.
  let genders: string[] | null = filters.seekingGenders?.length ? filters.seekingGenders : null;
  if (!genders && !(await hasSavedRomanceFilters())) {
    const { data: lf } = await supabase
      .from("user_profiles")
      .select("looking_for")
      .eq("id", authedUserId)
      .maybeSingle();
    const mapped = lookingForToGenders((lf as { looking_for?: string[] | null } | null)?.looking_for);
    genders = mapped.length ? mapped : null;
  }

  const { data: feedData, error } = await supabase.rpc("romance_discover_feed_geo", {
    current_user_id: authedUserId,
    p_max_distance_km: maxDistanceKm,
    p_age_min: filters.ageMin ?? null,
    p_age_max: filters.ageMax ?? null,
    p_genders: genders,
    p_limit: 100,
  });

  let rows: FeedRow[] = (feedData ?? []) as FeedRow[];

  if (error) {
    // Fallback: legacy feed (no geo), then plain view. Distance unavailable here.
    const { data: legacy, error: legacyErr } = await supabase.rpc("romance_discover_feed", {
      current_user_id: authedUserId,
    });
    if (!legacyErr && Array.isArray(legacy)) {
      rows = legacy as FeedRow[];
    } else {
      const { data: fallback } = await supabase
        .from("public_profile_view")
        .select(
          "id, first_name, age, city, interests, languages, occupation, bio_romance, core_photos, romance_photos",
        )
        .neq("id", authedUserId)
        .limit(50);
      rows = (fallback || []) as FeedRow[];
      rows = rows.filter(
        (r) =>
          (Array.isArray(r.romance_photos) && r.romance_photos.some((p) => !!p)) ||
          (r.bio_romance != null && String(r.bio_romance).trim() !== ""),
      );
    }
  }

  rows = rows.filter((r) => !blocked.has(r.id));

  const scored = rows.map((r) => {
    const other: RomanceProfile = {
      id: r.id,
      first_name: r.first_name,
      age: r.age ?? undefined,
      city: r.city ?? undefined,
      interests: r.interests ?? [],
      languages: r.languages ?? [],
      occupation: r.occupation ?? undefined,
      bio_romance: r.bio_romance ?? undefined,
    };
    const compatibility = computeCompatibilityScore({ self: self ?? undefined, other });
    return { ...r, compatibility };
  });

  let filtered = applyRomanceFiltersToFeed(scored, filters);
  const aiOn = await getRomanceAiMatchingEnabled();
  if (aiOn) {
    const ids = filtered.map((r) => r.id);
    const affMap = await fetchBehaviorAffinityMap(authedUserId, ids, "romance");
    filtered.sort((a, b) => {
      const ca = a.compatibility ?? 72;
      const cb = b.compatibility ?? 72;
      const sa = combinedMatchScore(ca, affMap.get(a.id) ?? 0.5);
      const sb = combinedMatchScore(cb, affMap.get(b.id) ?? 0.5);
      return sb - sa;
    });
  }

  // Names + privacy flag aren't part of the feed RPC; fetch them for the visible ids.
  const nameMap = new Map<string, { last_name?: string | null; show_full_name?: boolean | null }>();
  const visibleIds = filtered.map((r) => r.id);
  if (visibleIds.length) {
    const { data: nameRows } = await supabase
      .from("user_profiles")
      .select("id, last_name, show_full_name")
      .in("id", visibleIds);
    (nameRows ?? []).forEach((n) => {
      const row = n as { id: string; last_name?: string | null; show_full_name?: boolean | null };
      nameMap.set(row.id, { last_name: row.last_name, show_full_name: row.show_full_name });
    });
  }

  return filtered.map((r) => {
    const interests = (r.romance_interests?.filter(Boolean) as string[] | undefined)?.length
      ? (r.romance_interests as string[])
      : r.interests ?? [];
    const { ordered, shared } = orderSharedFirst(interests, self?.interests);
    const chipItems = ordered.slice(0, 3);
    const photoUrls = collectPhotoUrls(r.romance_photos, r.core_photos);
    const photoUrl = photoUrls[0] ?? "https://i.pravatar.cc/400?u=winkly";
    const nm = nameMap.get(r.id);
    return {
      id: r.id,
      name: modeDisplayName(
        { first_name: r.first_name, last_name: nm?.last_name, show_full_name: nm?.show_full_name },
        "romance",
        r.first_name ?? "Someone"
      ),
      age: typeof r.age === "number" && r.age > 0 ? r.age : 25,
      city: r.city ?? "",
      occupation: r.occupation ?? null,
      chipItems: chipItems.length ? chipItems : ["Romance"],
      highlightChips: shared,
      photoUrl,
      photoUrls: photoUrls.length ? photoUrls : [photoUrl],
      distanceLabel: r.distance_label ?? null,
    };
  });
}
