import {
  loadPublicCoreProfile,
  type PublicCoreProfile,
} from "@/lib/profile/publicModeProfile";

export {
  asStringArray,
  mergePhotoUrls,
  metaStringArray,
  modeDisplayName,
} from "@/lib/profile/otherUserFormat";

/** @deprecated Prefer PublicCoreProfile — kept for existing imports. */
export type OtherUserCoreFields = PublicCoreProfile;

/** Public core fields from user_profiles (authenticated users can read). */
export async function getOtherUserCoreFields(
  targetUserId: string
): Promise<PublicCoreProfile | null> {
  return loadPublicCoreProfile(targetUserId);
}
