import type { Mode } from "@/types";
import {
  loadPublicCoreProfile,
  type PublicCoreProfile,
} from "@/lib/profile/publicModeProfile";

/** @deprecated Prefer PublicCoreProfile — kept for existing imports. */
export type OtherUserCoreFields = PublicCoreProfile;

export function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

/** Public core fields from user_profiles (authenticated users can read). */
export async function getOtherUserCoreFields(
  targetUserId: string
): Promise<PublicCoreProfile | null> {
  return loadPublicCoreProfile(targetUserId);
}

/**
 * Name to display for another user in a given mode, honoring their privacy choice.
 * - Business: always full name (professional networking).
 * - Romance / Friends: full name only if the user opted in; otherwise first name.
 */
export function modeDisplayName(
  input: {
    first_name?: string | null;
    last_name?: string | null;
    show_full_name?: boolean | null;
    display_name?: string | null;
  },
  mode: Mode,
  fallback = "Someone"
): string {
  const first = (input.first_name ?? "").trim();
  const last = (input.last_name ?? "").trim();
  const full = `${first} ${last}`.trim();
  if (mode === "business") return full || (input.display_name ?? "").trim() || fallback;
  if (input.show_full_name === true) return full || first || (input.display_name ?? "").trim() || fallback;
  return first || (input.display_name ?? "").trim() || fallback;
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
