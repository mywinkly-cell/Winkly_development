import { supabase } from "@/lib/supabase";
import { getAgeFromBirthday } from "@/lib/access/profiles";
import type { Mode } from "@/types";
import {
  asStringArray,
  mergePhotoUrls,
  metaStringArray,
  modeDisplayName,
} from "@/lib/profile/otherUserCore";

/** Public general profile — same fields shown in preview & other-user views. */
export type PublicCoreProfile = {
  first_name: string;
  last_name: string;
  gender: string;
  city: string;
  education: string;
  occupation: string;
  languages: string[];
  instagram: string;
  interests: string[];
  core_photos: string[];
  show_full_name: boolean;
  night_owl: boolean | null;
  birthday: string | null;
};

export type PublicModeProfileRow = {
  bio: string;
  photos: string[];
  interests: string[];
  meta: Record<string, unknown>;
  lifestyle_tags: string[];
};

export type PublicProfileMode = Extract<Mode, "romance" | "friends" | "business" | "events">;

export function emptyPublicCoreProfile(): PublicCoreProfile {
  return {
    first_name: "",
    last_name: "",
    gender: "",
    city: "",
    education: "",
    occupation: "",
    languages: [],
    instagram: "",
    interests: [],
    core_photos: [],
    show_full_name: false,
    night_owl: null,
    birthday: null,
  };
}

export function parsePublicCoreProfile(row: Record<string, unknown> | null): PublicCoreProfile | null {
  if (!row) return null;
  return {
    first_name: String(row.first_name ?? "").trim(),
    last_name: String(row.last_name ?? "").trim(),
    gender: String(row.gender ?? "").trim(),
    city: String(row.city ?? "").trim(),
    education: String(row.education ?? "").trim(),
    occupation: String(row.occupation ?? "").trim(),
    languages: asStringArray(row.languages),
    instagram: String(row.instagram ?? "").trim(),
    interests: asStringArray(row.interests),
    core_photos: asStringArray(row.core_photos),
    show_full_name: row.show_full_name === true,
    night_owl: typeof row.night_owl === "boolean" ? row.night_owl : null,
    birthday: (row.birthday as string | null) ?? null,
  };
}

/** Load canonical public core fields for any user. */
export async function loadPublicCoreProfile(userId: string): Promise<PublicCoreProfile | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select(
      "first_name, last_name, gender, birthday, city, education, occupation, languages, instagram, interests, core_photos, show_full_name, night_owl"
    )
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return parsePublicCoreProfile(data as Record<string, unknown>);
}

/** Normalize mode-specific DB/view rows into one shape for the shared UI. */
export function normalizeModeProfileRow(
  mode: Exclude<PublicProfileMode, "events">,
  raw: Record<string, unknown> | null
): PublicModeProfileRow | null {
  if (!raw) return null;

  if (mode === "romance") {
    const meta = (raw.romance_meta ?? raw.meta ?? {}) as Record<string, unknown>;
    return {
      bio: String(raw.bio_romance ?? raw.bio ?? "").trim(),
      photos: asStringArray(raw.romance_photos ?? raw.photos),
      interests: asStringArray(raw.romance_interests ?? raw.interests),
      meta,
      lifestyle_tags: asStringArray(raw.lifestyle_tags),
    };
  }

  if (mode === "friends") {
    const meta = (raw.meta ?? {}) as Record<string, unknown>;
    const vibeTags = asStringArray(raw.vibe_tags);
    if (vibeTags.length > 0 && !meta.vibe_tags) {
      meta.vibe_tags = vibeTags;
    }
    return {
      bio: String(raw.about ?? raw.bio ?? "").trim(),
      photos: asStringArray(raw.photos ?? [raw.main_photo_url, raw.avatar_url]),
      interests: asStringArray(raw.interests),
      meta,
      lifestyle_tags: asStringArray(raw.lifestyle_tags),
    };
  }

  const meta = (raw.meta ?? {}) as Record<string, unknown>;
  return {
    bio: String(raw.bio ?? "").trim(),
    photos: asStringArray(
      raw.photos ?? [raw.main_photo_url, raw.avatar_url, raw.logo_uri]
    ),
    interests: asStringArray(raw.interests ?? raw.skills ?? raw.tags),
    meta: {
      ...meta,
      role: meta.role ?? raw.role_title ?? raw.role,
      company: meta.company ?? raw.company_name ?? raw.business_name,
      area: meta.area ?? raw.area,
      instagram: meta.instagram ?? raw.instagram,
    },
    lifestyle_tags: asStringArray(raw.lifestyle_tags),
  };
}

export function photosForPublicModeProfile(
  mode: PublicProfileMode,
  core: PublicCoreProfile,
  modeRow: PublicModeProfileRow | null
): string[] {
  if (mode === "events") return core.core_photos;
  return mergePhotoUrls(modeRow?.photos ?? [], core.core_photos);
}

export function displayNameForPublicModeProfile(
  mode: PublicProfileMode,
  core: PublicCoreProfile,
  fallback = "Someone"
): string {
  const nameMode: Mode = mode === "events" ? "friends" : mode;
  return modeDisplayName(
    {
      first_name: core.first_name,
      last_name: core.last_name,
      show_full_name: core.show_full_name,
    },
    nameMode,
    fallback
  );
}

export function ageForPublicCoreProfile(core: PublicCoreProfile): number | null {
  return getAgeFromBirthday(core.birthday);
}

export { metaStringArray, asStringArray };
