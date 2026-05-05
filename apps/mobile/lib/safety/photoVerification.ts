import { supabase } from "@/lib/supabase";

export type VerificationRow = {
  id: string;
  status: string;
  similarity_score: number | null;
};

/** Call Edge Function after uploading selfie to Storage (path relative to bucket or public URL). */
export async function submitPhotoVerification(selfiePath: string, profilePhotoIndex = 0): Promise<VerificationRow> {
  const { data, error } = await supabase.functions.invoke("verify-profile-photo", {
    body: { selfie_path: selfiePath, profile_photo_index: profilePhotoIndex },
  });
  if (error) throw error;
  const v = (data as { verification?: VerificationRow })?.verification;
  if (!v) throw new Error("No verification in response");
  return v;
}
