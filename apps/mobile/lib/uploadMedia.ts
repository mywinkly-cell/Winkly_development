// ────────────────────────────────────────────────
// Winkly Upload Utilities – Photos & Videos
// v7.0 – November 2025
// © Winkly Technologies UG (haftungsbeschränkt)
// Purpose: Unified upload logic for personal profiles
// (core + sub-profiles: romance / friends / business)
// Profile photos and chat images are moderated server-side (docs/MODERATION.md).
// ────────────────────────────────────────────────

import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "@/lib/supabase";
import { Alert } from "react-native";
import { decode } from "base64-arraybuffer";
import { validatePickerAsset, validateMediaForUpload } from "@/lib/mediaValidation";
import { CACHE_CONTROL_IMMUTABLE } from "@/lib/images/cdnImage";
import { CHAT_MEDIA_BUCKET, signChatMediaPath } from "@/lib/chats/chatMedia";
import { t } from "i18next";
import {
  MEDIA_QUARANTINE_BUCKET,
  requestModeration,
  summarizeProfileUploads,
  type ModerationResponse,
  type ModerationStatus,
  type UploadModerationSummary,
} from "@/lib/moderation/mediaModeration";

/**
 * Profile photos never go straight to the public user-photos bucket (clients can't
 * write there). They are uploaded to the PRIVATE media-quarantine bucket and the
 * moderate-media Edge Function promotes them on "pass". See docs/MODERATION.md.
 */
async function uploadProfilePhotoForModeration(
  userId: string,
  mode: string,
  bytes: ArrayBuffer,
  contentType: string,
  ext: string
): Promise<ModerationResponse> {
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const filePath = `${userId}/${mode}/${filename}`;
  const { error } = await supabase.storage
    .from(MEDIA_QUARANTINE_BUCKET)
    .upload(filePath, bytes, { contentType, upsert: false });
  if (error) throw error;
  return requestModeration("profile_photo", filePath);
}

/** One kind, non-alarming notice for photos that were held or rejected. */
function alertProfileModeration(summary: Pick<UploadModerationSummary, "held" | "blocked">) {
  if (summary.blocked > 0) {
    Alert.alert(t("moderation.photoBlockedTitle"), t("moderation.photoBlockedBody"));
  } else if (summary.held > 0) {
    Alert.alert(t("moderation.photoHeldTitle"), t("moderation.photoHeldBody"));
  }
}

/**
 * pickAndUploadPhoto
 * @param userId - authenticated user id
 * @param mode - 'core' | 'romance' | 'friends' | 'business'
 * @returns uploaded public URL or null
 */
export async function pickAndUploadPhoto(userId: string, mode: string = "core") {
  try {
    // ───── Request media permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission denied", "Media access is required to upload photos.");
      return null;
    }

    // ───── Launch image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
      base64: true,
    });

    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];

    // ───── Validate before any network call (size + MIME)
    const check = await validatePickerAsset(asset, "image");
    if (!check.ok) {
      Alert.alert("Photo not allowed", check.reason ?? "Please pick a different photo.");
      return null;
    }

    // ───── Upload to quarantine + server-side moderation
    const res = await uploadProfilePhotoForModeration(userId, mode, decode(asset.base64!), "image/jpeg", "jpg");
    if (res.status === "pass" && res.url) return res.url;
    alertProfileModeration({ held: res.status === "block" ? 0 : 1, blocked: res.status === "block" ? 1 : 0 });
    return null;
  } catch (err: any) {
    Alert.alert("Upload failed", err.message ?? "Could not upload photo.");
    return null;
  }
}

/**
 * pickAndUploadVideo
 * @param userId - authenticated user id
 * @param mode - 'romance' | 'friends' | 'business'
 * @returns uploaded public URL or null
 */
export async function pickAndUploadVideo(userId: string, mode: string) {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission denied", "Media access is required to upload videos.");
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];

    // ───── Validate before any network call (size + MIME)
    const check = await validatePickerAsset(asset, "video");
    if (!check.ok) {
      Alert.alert("Video not allowed", check.reason ?? "Please pick a different video.");
      return null;
    }

    const uri = asset.uri;
    const filename = `${Date.now()}_${Math.floor(Math.random() * 9999)}.mp4`;
    const filePath = `${userId}/${mode}/${filename}`;

    // ───── Convert to blob for upload
    const response = await fetch(uri);
    const blob = await response.blob();

    const { error } = await supabase.storage
      .from("user-videos")
      .upload(filePath, blob, {
        contentType: "video/mp4",
        cacheControl: CACHE_CONTROL_IMMUTABLE,
        upsert: true,
      });

    if (error) throw error;

    const { data } = supabase.storage.from("user-videos").getPublicUrl(filePath);
    return data.publicUrl;
  } catch (err: any) {
    Alert.alert("Upload failed", err.message ?? "Could not upload video.");
    return null;
  }
}

/**
 * Chat: pick and upload one or multiple images to the PRIVATE chat-media bucket.
 * Returns attachments carrying the durable storage `path`; `url` is a signed URL
 * minted for immediate optimistic display (the chat re-signs on read).
 */
export async function pickAndUploadChatImages(
  conversationId: string,
  userId: string
): Promise<{ type: "image"; url: string; path: string; moderation: ModerationStatus }[]> {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission denied", "Media access is required to add photos.");
      return [];
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.85,
      base64: true,
    });

    if (result.canceled || !result.assets?.length) return [];

    const attachments: { type: "image"; url: string; path: string; moderation: ModerationStatus }[] = [];
    let blocked = 0;

    for (const asset of result.assets) {
      if (!asset.base64) continue;

      // ───── Validate each image before upload (size + MIME)
      const check = await validatePickerAsset(asset, "image");
      if (!check.ok) {
        Alert.alert("Photo skipped", check.reason ?? "One photo was not allowed.");
        continue;
      }

      const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      // Path: {userId}/{conversationId}/{file} — owner-scoped writes + GDPR erasure
      // by `{userId}/` prefix; reads gated on conversation membership (RLS).
      const filePath = `${userId}/${conversationId}/${filename}`;

      const { error } = await supabase.storage
        .from(CHAT_MEDIA_BUCKET)
        .upload(filePath, decode(asset.base64), {
          contentType: "image/jpeg",
          cacheControl: CACHE_CONTROL_IMMUTABLE,
          upsert: true,
        });

      if (error) {
        console.warn("Chat image upload error:", error);
        continue;
      }

      // Server-side moderation before the image is sent. "block" deletes the object;
      // "review" is sent but recipients see it blurred behind "Tap to view".
      const verdict = await requestModeration("chat_image", filePath);
      if (verdict.status === "block") {
        blocked += 1;
        continue;
      }

      attachments.push({
        type: "image",
        path: filePath,
        url: await signChatMediaPath(filePath),
        moderation: verdict.status,
      });
    }

    if (blocked > 0) {
      Alert.alert(t("moderation.chatBlockedTitle"), t("moderation.chatBlockedBody"));
    }

    return attachments;
  } catch (err: any) {
    Alert.alert("Upload failed", err.message ?? "Could not add photos.");
    return [];
  }
}

/**
 * Upload an array of (possibly local) photo URIs through moderation.
 * Already-remote URLs (http/https) are passed through untouched, so this is
 * safe to call on every save. Each local file is validated (size) before upload.
 * Returns the passed public URLs in the same order, plus how many photos were
 * held for review or blocked (those are NOT in `urls`; a held photo is added to
 * the profile by the server once a moderator approves it).
 */
export async function uploadLocalPhotosModerated(
  userId: string,
  mode: string,
  uris: (string | null | undefined)[]
): Promise<UploadModerationSummary> {
  const results: Parameters<typeof summarizeProfileUploads>[0] = [];
  for (const uri of uris) {
    if (!uri) continue;
    if (uri.startsWith("http")) {
      results.push({ kind: "existing", url: uri });
      continue;
    }
    try {
      const isPng = uri.toLowerCase().includes(".png");
      const contentType = isPng ? "image/png" : "image/jpeg";
      const check = await validateMediaForUpload({ uri, kind: "image", mimeType: contentType });
      if (!check.ok) {
        Alert.alert("Photo skipped", check.reason ?? "One photo was too large to upload.");
        continue;
      }
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const res = await uploadProfilePhotoForModeration(
        userId,
        mode,
        decode(base64),
        contentType,
        isPng ? "png" : "jpg"
      );
      results.push({ kind: "moderated", res });
    } catch (err: any) {
      results.push({ kind: "failed" });
      Alert.alert("Upload failed", err?.message ?? "Could not upload a photo.");
    }
  }
  const summary = summarizeProfileUploads(results);
  alertProfileModeration(summary);
  return summary;
}

/** Same as uploadLocalPhotosModerated, returning only the passed public URLs. */
export async function uploadLocalPhotos(
  userId: string,
  mode: string,
  uris: (string | null | undefined)[]
): Promise<string[]> {
  return (await uploadLocalPhotosModerated(userId, mode, uris)).urls;
}

/**
 * Upload an array of (possibly local) video URIs to the user-videos bucket.
 * Remote URLs pass through untouched. Returns public URLs in order.
 */
export async function uploadLocalVideos(
  userId: string,
  mode: string,
  uris: (string | null | undefined)[]
): Promise<string[]> {
  const out: string[] = [];
  for (const uri of uris) {
    if (!uri) continue;
    if (uri.startsWith("http")) {
      out.push(uri);
      continue;
    }
    try {
      const check = await validateMediaForUpload({ uri, kind: "video", mimeType: "video/mp4" });
      if (!check.ok) {
        Alert.alert("Video skipped", check.reason ?? "One video was too large to upload.");
        continue;
      }
      const response = await fetch(uri);
      const blob = await response.blob();
      const filePath = `${userId}/${mode}/${Date.now()}_${Math.floor(Math.random() * 9999)}.mp4`;
      const { error } = await supabase.storage
        .from("user-videos")
        .upload(filePath, blob, { contentType: "video/mp4", cacheControl: CACHE_CONTROL_IMMUTABLE, upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("user-videos").getPublicUrl(filePath);
      out.push(data.publicUrl);
    } catch (err: any) {
      Alert.alert("Upload failed", err?.message ?? "Could not upload a video.");
    }
  }
  return out;
}

/**
 * Chat voice note: upload local recording (m4a) to the PRIVATE chat-media bucket.
 * Returns an attachment carrying the durable storage `path`; `url` is a signed URL
 * for immediate playback (the chat re-signs on read).
 */
export async function uploadChatVoiceFromUri(
  conversationId: string,
  userId: string,
  fileUri: string
): Promise<{ type: "audio"; url: string; path: string; name?: string } | null> {
  try {
    const check = await validateMediaForUpload({ uri: fileUri, kind: "audio", mimeType: "audio/mp4" });
    if (!check.ok) {
      Alert.alert("Voice message not sent", check.reason ?? "Recording is too large.");
      return null;
    }
    const response = await fetch(fileUri);
    const blob = await response.blob();
    const path = `${userId}/${conversationId}/voice_${Date.now()}.m4a`;
    const { error } = await supabase.storage.from(CHAT_MEDIA_BUCKET).upload(path, blob, {
      contentType: "audio/mp4",
      cacheControl: CACHE_CONTROL_IMMUTABLE,
      upsert: true,
    });
    if (error) throw error;
    return { type: "audio", path, url: await signChatMediaPath(path), name: "Voice message" };
  } catch (err: unknown) {
    Alert.alert("Upload failed", err instanceof Error ? err.message : "Could not send voice message.");
    return null;
  }
}
