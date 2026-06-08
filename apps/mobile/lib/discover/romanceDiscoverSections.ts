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
import { getOrCreateDailySectionItems } from "./sectionStorage";
import { relationshipGoalsFromMeta, sharedCount } from "./metaGoals";
import { DISCOVER_LIMITS } from "./storage";
import type { DiscoverProfileItem } from "./types";

type RomanceFeedRow = {
  id: string;
  first_name: string;
  last_name?: string | null;
  age?: number | null;
  interests?: string[] | null;
  languages?: string[] | null;
  occupation?: string | null;
  bio_romance?: string | null;
  romance_photos?: (string | null)[];
  core_photos?: (string | null)[];
  romance_interests?: (string | null)[] | null;
  romance_meta?: Record<string, unknown> | null;
  distance_km?: number | null;
  distance_label?: string | null;
  compatibility?: number | null;
};

const DISTANCE_KM_ANY = 999;

export function romanceRowToItem(row: RomanceFeedRow): DiscoverProfileItem {
  const photo = row.romance_photos?.[0] ?? row.core_photos?.[0];
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "Someone";
  return {
    id: row.id,
    name,
    age: row.age ?? null,
    photoUrl: photo ?? null,
  };
}

function interestsForRow(row: RomanceFeedRow): string[] {
  const romance = (row.romance_interests ?? []).filter(Boolean) as string[];
  return romance.length ? romance : row.interests ?? [];
}

export async function fetchRomanceDiscoverPool(
  authedUserId: string,
  self: RomanceProfile | null,
): Promise<RomanceFeedRow[]> {
  const blocked = await getBlockedUserIdSet(authedUserId);
  const filters = await getRomanceFilters();

  const maxDistanceKm =
    filters.distanceKm && filters.distanceKm !== DISTANCE_KM_ANY ? filters.distanceKm : null;

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
    p_limit: 120,
  });

  let rows: RomanceFeedRow[] = (feedData ?? []) as RomanceFeedRow[];

  if (error) {
    const { data: legacy } = await supabase.rpc("romance_discover_feed", {
      current_user_id: authedUserId,
    });
    rows = (legacy ?? []) as RomanceFeedRow[];
    if (!rows.length) {
      const { data: fallback } = await supabase
        .from("public_profile_view")
        .select(
          "id, first_name, last_name, age, interests, languages, occupation, bio_romance, core_photos, romance_photos, romance_interests, romance_meta",
        )
        .neq("id", authedUserId)
        .limit(80);
      rows = (fallback ?? []) as RomanceFeedRow[];
    }
  }

  rows = rows.filter((r) => !blocked.has(r.id));

  const scored = rows.map((r) => {
    const other: RomanceProfile = {
      id: r.id,
      first_name: r.first_name,
      age: r.age ?? undefined,
      city: undefined,
      interests: interestsForRow(r),
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

  return filtered;
}

export async function loadRomanceRecommended(
  authedUserId: string,
  self: RomanceProfile | null,
): Promise<DiscoverProfileItem[]> {
  const pool = await fetchRomanceDiscoverPool(authedUserId, self);
  const items = pool.map(romanceRowToItem);
  return getOrCreateDailySectionItems(
    "romance",
    "recommended",
    items,
    DISCOVER_LIMITS.categoryPerDay,
  );
}

export async function loadRomanceSameInterests(
  authedUserId: string,
  self: RomanceProfile | null,
  selfInterests: string[],
): Promise<DiscoverProfileItem[]> {
  const pool = await fetchRomanceDiscoverPool(authedUserId, self);
  const ranked = pool
    .map((row) => ({ row, overlap: sharedCount(selfInterests, interestsForRow(row)) }))
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .map((x) => romanceRowToItem(x.row));

  return getOrCreateDailySectionItems(
    "romance",
    "same_interests",
    ranked,
    DISCOVER_LIMITS.categoryPerDay,
  );
}

export async function loadRomanceSameGoals(
  authedUserId: string,
  self: RomanceProfile | null,
  selfGoals: string[],
): Promise<DiscoverProfileItem[]> {
  const pool = await fetchRomanceDiscoverPool(authedUserId, self);
  const ranked = pool
    .map((row) => ({
      row,
      overlap: sharedCount(selfGoals, relationshipGoalsFromMeta(row.romance_meta)),
    }))
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .map((x) => romanceRowToItem(x.row));

  return getOrCreateDailySectionItems(
    "romance",
    "same_goals",
    ranked,
    DISCOVER_LIMITS.categoryPerDay,
  );
}

export async function loadRomanceNearby(
  authedUserId: string,
  self: RomanceProfile | null,
): Promise<DiscoverProfileItem[]> {
  const pool = await fetchRomanceDiscoverPool(authedUserId, self);
  const ranked = [...pool]
    .sort((a, b) => {
      const da = a.distance_km ?? 99999;
      const db = b.distance_km ?? 99999;
      return da - db;
    })
    .map(romanceRowToItem);

  return getOrCreateDailySectionItems("romance", "nearby", ranked, DISCOVER_LIMITS.categoryPerDay);
}
