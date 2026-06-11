// lib/access/profiles.ts — Mode-safe profile reads and writes

import { supabase } from "@/lib/supabase";
import type { BusinessProfileType, Mode } from "@/types";

export function getAgeFromBirthday(birthday: string | Date | null | undefined): number | null {
  if (!birthday) return null;
  const d = typeof birthday === "string" ? new Date(birthday) : birthday;
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age >= 18 ? age : null;
}

async function requireAuthedUserId(expected?: string) {
  const { data } = await supabase.auth.getUser();
  const uid = data?.user?.id;
  if (!uid) throw new Error("Not signed in");
  if (expected && expected !== uid) throw new Error("Caller userId mismatch");
  return uid;
}

export type BusinessFeedRpcParams = {
  query?: string;
  roleType?: string | null;
  networkingGoal?: string | null;
  skills?: string[];
  sort?: "relevant" | "newest" | "nearest" | "mutual";
  cursor?: string | null;
};

/** Get profiles for a mode — mode-locked, no cross-mode leakage */
export async function getProfilesForMode(
  mode: Mode,
  userId: string,
  limit = 20,
  businessParams?: BusinessFeedRpcParams
) {
  if (!mode || !userId) return [];
  if (mode === "business") {
    const authed = await requireAuthedUserId(userId);
    const useHome = !businessParams?.cursor && (businessParams?.sort ?? "relevant") === "relevant";
    const rpcName = useHome ? "business_home_feed" : "business_discover_feed";
    const rpcArgs: Record<string, unknown> = {
      current_user_id: authed,
      p_limit: limit,
      p_query: businessParams?.query || null,
      p_role_type: businessParams?.roleType || null,
      p_networking_goal: businessParams?.networkingGoal || null,
    };
    if (!useHome) {
      Object.assign(rpcArgs, {
        p_skills: businessParams?.skills?.length ? businessParams.skills : null,
        p_sort:
          businessParams?.sort === "newest"
            ? "newest"
            : businessParams?.sort === "relevant"
              ? "relevant"
              : "relevant",
        p_cursor: businessParams?.cursor || null,
      });
    }
    const { data, error } = await supabase.rpc(rpcName, rpcArgs);
    if (error) {
      console.warn(`getProfilesForMode business ${rpcName} error`, error);
      return [];
    }
    return data ?? [];
  }
  if (mode === "romance") {
    const authed = await requireAuthedUserId(userId);
    const { data, error } = await supabase.rpc("romance_discover_feed", {
      current_user_id: authed,
    });
    if (error) {
      console.warn("getProfilesForMode romance error", error);
      return [];
    }
    return (data ?? []).slice(0, limit);
  }
  if (mode === "friends") {
    const authed = await requireAuthedUserId(userId);
    const { data, error } = await supabase.rpc("friends_discover_feed", {
      current_user_id: authed,
      p_limit: limit,
    });
    if (error) {
      console.warn("getProfilesForMode friends error", error);
      return [];
    }
    return data ?? [];
  }
  // Mode not supported for discover feeds
  return [];
}

/** Mode-isolated read for a single user profile (discover, matches, chat entry points). */
export async function getProfileForMode(
  mode: Mode,
  viewerId: string,
  targetUserId: string
): Promise<Record<string, unknown> | null> {
  if (!mode || !viewerId || !targetUserId) return null;
  await requireAuthedUserId(viewerId);

  if (mode === "romance") {
    const { data, error } = await supabase
      .from("public_profile_view")
      .select("*")
      .eq("id", targetUserId)
      .maybeSingle();
    if (error) {
      console.warn("getProfileForMode romance error", error);
      return null;
    }
    return (data as Record<string, unknown> | null) ?? null;
  }

  if (mode === "friends") {
    const { data, error } = await supabase
      .from("friend_profiles")
      .select("*")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (error) {
      console.warn("getProfileForMode friends error", error);
      return null;
    }
    return (data as Record<string, unknown> | null) ?? null;
  }

  if (mode === "business") {
    const { data: businessRow, error: businessErr } = await supabase.rpc(
      "business_profile_for_viewer",
      {
        current_user_id: viewerId,
        target_user_id: targetUserId,
      }
    );
    if (businessErr) {
      console.warn("getProfileForMode business RPC error", businessErr);
    } else {
      const row = Array.isArray(businessRow) ? businessRow[0] : businessRow;
      if (row) return row as Record<string, unknown>;
    }

    const { data: modeRow, error: modeErr } = await supabase
      .from("profiles_mode")
      .select(
        "user_id, bio, photos, interests, meta, lifestyle_tags, user_profiles!inner(first_name, last_name, city, birthday, occupation, core_photos, instagram)"
      )
      .eq("user_id", targetUserId)
      .eq("mode", "business")
      .maybeSingle();

    if (modeErr || !modeRow) {
      if (modeErr) console.warn("getProfileForMode business mode error", modeErr);
      return null;
    }

    const joined = modeRow as {
      user_id: string;
      bio?: string | null;
      photos?: string[] | null;
      interests?: string[] | null;
      meta?: Record<string, unknown> | null;
      user_profiles?: Record<string, unknown> | Record<string, unknown>[] | null;
    };
    const upRaw = joined.user_profiles;
    const up = (Array.isArray(upRaw) ? upRaw[0] : upRaw) ?? {};
    const meta = (joined.meta ?? {}) as Record<string, unknown>;
    const photos = Array.isArray(joined.photos) ? joined.photos.filter(Boolean) : [];
    const corePhotos = Array.isArray(up.core_photos)
      ? (up.core_photos as string[]).filter(Boolean)
      : [];
    const skillsRaw = joined.interests;
    const skillsFromMeta =
      typeof meta.skills === "string"
        ? meta.skills
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    return {
      id: joined.user_id,
      user_id: joined.user_id,
      first_name: up.first_name ?? null,
      last_name: up.last_name ?? null,
      display_name:
        [up.first_name, up.last_name].filter(Boolean).join(" ").trim() || "Professional",
      role_title: meta.role ?? null,
      company_name: meta.company ?? null,
      city: up.city ?? null,
      bio: joined.bio ?? meta.networking_goal ?? null,
      skills: Array.isArray(skillsRaw) && skillsRaw.length ? skillsRaw : skillsFromMeta,
      main_photo_url: photos[0] ?? corePhotos[0] ?? null,
      avatar_url: photos[0] ?? corePhotos[0] ?? null,
      instagram: up.instagram ?? null,
      meta,
      photos,
    };
  }

  return null;
}

export async function getOwnProfileCore(userId: string) {
  const { data, error } = await supabase
    .from("profiles_core")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) return null;
  return data;
}

export type ProfileCoreUpdate = {
  first_name?: string | null;
  last_name?: string | null;
  gender?: string | null;
  birthday?: string | null;
  city?: string | null;
  education?: string | null;
  languages?: string[] | null;
  occupation?: string | null;
  bio?: string | null;
  /** General profile interests (shared across Romance & Friends). */
  interests?: string[] | null;
  looking_for?: string[] | null;
  activity_preferences?: string[] | null;
  core_photos?: string[] | null;
  instagram?: string | null;
  night_owl?: boolean | null;
  /** When true, Romance & Friends show the user's full name; otherwise first name only. */
  show_full_name?: boolean | null;
};

/** Upsert current user's core profile (insert or update by id). */
export async function upsertOwnProfileCore(
  userId: string,
  payload: ProfileCoreUpdate
) {
  const { error } = await supabase
    .from("profiles_core")
    .upsert(
      { id: userId, ...payload, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
  return { error };
}

export async function getOwnProfileMode(userId: string, mode: Mode) {
  const { data, error } = await supabase
    .from("profiles_mode")
    .select("*")
    .eq("user_id", userId)
    .eq("mode", mode)
    .maybeSingle();
  if (error) return null;
  return data;
}

export type ProfileModeUpdate = {
  bio?: string | null;
  photos?: string[] | null;
  interests?: string[] | null;
  meta?: Record<string, unknown> | null;
  lifestyle_tags?: string[] | null;
  voice_prompt_url?: string | null;
  voice_prompt_seconds?: number | null;
  video_bio_url?: string | null;
  video_poster_url?: string | null;
};

/** Upsert current user's mode sub-profile (insert or update by user_id + mode). */
export async function upsertOwnProfileMode(
  userId: string,
  mode: Mode,
  payload: ProfileModeUpdate
) {
  const { error } = await supabase
    .from("profiles_mode")
    .upsert(
      {
        user_id: userId,
        mode,
        ...payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,mode" }
    );
  return { error };
}

export async function getOwnProfileBusiness(userId: string) {
  const { data, error } = await supabase
    .from("profiles_business")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) return null;
  return data;
}

export type ProfileBusinessUpdate = {
  business_name: string;
  business_type?: BusinessProfileType;
  location?: string | null;
  area?: string | null;
  bio?: string | null;
  tags?: string[] | null;
  website?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  linkedin?: string | null;
  logo_uri?: string | null;
};

/** Upsert current user's business profile (business accounts only). */
export async function upsertOwnProfileBusiness(
  userId: string,
  payload: ProfileBusinessUpdate
) {
  const { error } = await supabase
    .from("profiles_business")
    .upsert(
      { id: userId, ...payload, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
  return { error };
}
