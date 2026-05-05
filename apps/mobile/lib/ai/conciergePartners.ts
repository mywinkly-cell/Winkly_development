/**
 * Fetch partners (matches/connections) for "With whom" in Concierge.
 * Romance: mutual matches. Friends/Business: mutual follows.
 */

import { supabase } from "@/lib/supabase";
import type { Mode } from "@/types";

export type ConciergePartner = {
  id: string;
  first_name: string | null;
  displayName: string;
  avatar_url: string | null;
};

export async function getPartnersForConcierge(mode: Mode): Promise<ConciergePartner[]> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) return [];

  if (mode === "romance") {
    const [newRes, connRes] = await Promise.all([
      supabase.rpc("romance_new_matches", { current_user_id: me }),
      supabase.rpc("romance_connections", { current_user_id: me }),
    ]);
    const newMatches = (newRes.data ?? []) as Record<string, unknown>[];
    const connections = (connRes.data ?? []) as Record<string, unknown>[];
    const seen = new Set<string>();
    const list: ConciergePartner[] = [];
    for (const m of [...newMatches, ...connections]) {
      const id = m.id as string;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const first = (m.first_name as string) ?? "";
      const last = (m.last_name as string) ?? "";
      const displayName = `${first} ${last}`.trim() || "Match";
      const photos = (m.romance_photos as string[]) ?? (m.core_photos as string[]) ?? [];
      const avatar_url = photos.find(Boolean) ?? null;
      list.push({ id, first_name: first || null, displayName, avatar_url });
    }
    return list;
  }

  if (mode === "friends" || mode === "business") {
    const [iFollowRes, followMeRes] = await Promise.all([
      supabase.from("follows").select("followee_id").eq("follower_id", me),
      supabase.from("follows").select("follower_id").eq("followee_id", me),
    ]);
    const iFollowIds = new Set((iFollowRes.data ?? []).map((r: { followee_id: string }) => r.followee_id));
    const mutualIds = (followMeRes.data ?? [])
      .map((r: { follower_id: string }) => r.follower_id)
      .filter((id: string) => iFollowIds.has(id));
    if (mutualIds.length === 0) return [];
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, first_name, last_name, main_photo_url")
      .in("id", mutualIds);
    return (profiles ?? []).map((p: Record<string, unknown>) => {
      const first = (p.first_name as string) ?? "";
      const last = (p.last_name as string) ?? "";
      const displayName = `${first} ${last}`.trim() || "Connection";
      return {
        id: p.id as string,
        first_name: first || null,
        displayName,
        avatar_url: (p.main_photo_url as string) ?? null,
      };
    });
  }

  return [];
}

/** Search Winkly users by name for "Invite" (contact list / search). Excludes current user. */
export async function searchWinklyUsersForInvite(query: string, limit = 30): Promise<ConciergePartner[]> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) return [];

  const trimmed = query.trim();
  let dbQuery = supabase
    .from("user_profiles")
    .select("id, first_name, last_name, main_photo_url")
    .neq("id", me)
    .limit(limit);

  if (trimmed.length >= 1) {
    dbQuery = dbQuery.or(
      `first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%`
    );
  } else {
    dbQuery = dbQuery.order("first_name", { ascending: true });
  }

  const { data, error } = await dbQuery;
  if (error) return [];
  return (data ?? []).map((p: Record<string, unknown>) => {
    const first = (p.first_name as string) ?? "";
    const last = (p.last_name as string) ?? "";
    const displayName = `${first} ${last}`.trim() || "Contact";
    return {
      id: p.id as string,
      first_name: first || null,
      displayName,
      avatar_url: (p.main_photo_url as string) ?? null,
    };
  });
}
