import { supabase } from "@/lib/supabase";

export type OtherUserCoreFields = {
  bio: string | null;
  education: string | null;
  activity_preferences: string[];
  core_photos: string[];
};

export function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

/** Public core fields from user_profiles (authenticated users can read). */
export async function getOtherUserCoreFields(
  targetUserId: string
): Promise<OtherUserCoreFields | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("bio, education, activity_preferences, core_photos")
    .eq("id", targetUserId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as {
    bio?: string | null;
    education?: string | null;
    activity_preferences?: string[] | null;
    core_photos?: string[] | null;
  };

  return {
    bio: row.bio?.trim() || null,
    education: row.education?.trim() || null,
    activity_preferences: asStringArray(row.activity_preferences),
    core_photos: asStringArray(row.core_photos),
  };
}

export function mergePhotoUrls(...groups: (string | null | undefined)[][]): string[] {
  const out: string[] = [];
  for (const group of groups) {
    for (const uri of group) {
      if (uri && !out.includes(uri)) out.push(uri);
    }
  }
  return out;
}

export function metaStringArray(meta: Record<string, unknown> | null | undefined, key: string): string[] {
  if (!meta) return [];
  const v = meta[key];
  if (Array.isArray(v)) return asStringArray(v);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}
