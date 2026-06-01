// lib/access/profiles.ts — Mode-safe profile reads and writes

import { supabase } from "@/lib/supabase";
import type { Mode } from "@/types";

async function requireAuthedUserId(expected?: string) {
  const { data } = await supabase.auth.getUser();
  const uid = data?.user?.id;
  if (!uid) throw new Error("Not signed in");
  if (expected && expected !== uid) throw new Error("Caller userId mismatch");
  return uid;
}

/** Get profiles for a mode — mode-locked, no cross-mode leakage */
export async function getProfilesForMode(
  mode: Mode,
  userId: string,
  limit = 20
) {
  if (!mode || !userId) return [];
  if (mode === "business") {
    const authed = await requireAuthedUserId(userId);
    const { data, error } = await supabase.rpc("business_discover_feed", {
      current_user_id: authed,
      p_limit: limit,
    });
    if (error) {
      console.warn("getProfilesForMode business error", error);
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
  looking_for?: string[] | null;
  activity_preferences?: string[] | null;
  core_photos?: string[] | null;
  instagram?: string | null;
  night_owl?: boolean | null;
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
