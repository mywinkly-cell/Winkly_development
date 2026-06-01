// ────────────────────────────────────────────────
// Winkly Upload Utilities – Photos & Videos
// v7.0 – November 2025
// © Winkly Technologies UG (haftungsbeschränkt)
// Maintainer: Kateryna Shyshkalova
// Purpose: Unified upload logic for personal profiles
// (core + sub-profiles: romance / friends / business)
// ────────────────────────────────────────────────

import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "@/lib/supabase";
import { Alert } from "react-native";
import { decode } from "base64-arraybuffer";
import { validatePickerAsset, validateMediaForUpload } from "@/lib/mediaValidation";
import { CACHE_CONTROL_IMMUTABLE } from "@/lib/images/cdnImage";

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

    // ───── Prepare upload path
    const filename = `${Date.now()}_${Math.floor(Math.random() * 9999)}.jpg`;
    const filePath = `${userId}/${mode}/${filename}`;

    // ───── Upload to Supabase
    const { error } = await supabase.storage
      .from("user-photos")
      .upload(filePath, decode(asset.base64!), {
        contentType: "image/jpeg",
        cacheControl: CACHE_CONTROL_IMMUTABLE,
        upsert: true,
      });

    if (error) throw error;

    // ───── Get public URL
    const { data } = supabase.storage.from("user-photos").getPublicUrl(filePath);
    return data.publicUrl;
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

/** Chat: pick and upload one or multiple images. Returns attachment array. */
export async function pickAndUploadChatImages(userId: string): Promise<{ type: "image"; url: string }[]> {
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

    const attachments: { type: "image"; url: string }[] = [];

    for (const asset of result.assets) {
      if (!asset.base64) continue;

      // ───── Validate each image before upload (size + MIME)
      const check = await validatePickerAsset(asset, "image");
      if (!check.ok) {
        Alert.alert("Photo skipped", check.reason ?? "One photo was not allowed.");
        continue;
      }

      const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const filePath = `${userId}/chat/${filename}`;

      const { error } = await supabase.storage
        .from("user-photos")
        .upload(filePath, decode(asset.base64), {
          contentType: "image/jpeg",
          cacheControl: CACHE_CONTROL_IMMUTABLE,
          upsert: true,
        });

      if (error) {
        console.warn("Chat image upload error:", error);
        continue;
      }

      const { data } = supabase.storage.from("user-photos").getPublicUrl(filePath);
      attachments.push({ type: "image", url: data.publicUrl });
    }

    return attachments;
  } catch (err: any) {
    Alert.alert("Upload failed", err.message ?? "Could not add photos.");
    return [];
  }
}

/**
 * Upload an array of (possibly local) photo URIs to the user-photos bucket.
 * Already-remote URLs (http/https) are passed through untouched, so this is
 * safe to call on every save. Each local file is validated (size) before upload.
 * Returns the list of public URLs in the same order, dropping any that fail.
 */
export async function uploadLocalPhotos(
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
      const filename = `${Date.now()}_${Math.floor(Math.random() * 9999)}.${isPng ? "png" : "jpg"}`;
      const filePath = `${userId}/${mode}/${filename}`;
      const { error } = await supabase.storage
        .from("user-photos")
        .upload(filePath, decode(base64), { contentType, cacheControl: CACHE_CONTROL_IMMUTABLE, upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("user-photos").getPublicUrl(filePath);
      out.push(data.publicUrl);
    } catch (err: any) {
      Alert.alert("Upload failed", err?.message ?? "Could not upload a photo.");
    }
  }
  return out;
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

/** Chat voice note: upload local recording (m4a) to shared bucket, return audio attachment. */
export async function uploadChatVoiceFromUri(
  userId: string,
  fileUri: string
): Promise<{ type: "audio"; url: string; name?: string } | null> {
  try {
    const check = await validateMediaForUpload({ uri: fileUri, kind: "audio", mimeType: "audio/mp4" });
    if (!check.ok) {
      Alert.alert("Voice message not sent", check.reason ?? "Recording is too large.");
      return null;
    }
    const response = await fetch(fileUri);
    const blob = await response.blob();
    const path = `${userId}/chat/voice_${Date.now()}.m4a`;
    const { error } = await supabase.storage.from("user-videos").upload(path, blob, {
      contentType: "audio/mp4",
      cacheControl: CACHE_CONTROL_IMMUTABLE,
      upsert: true,
    });
    if (error) throw error;
    const { data } = supabase.storage.from("user-videos").getPublicUrl(path);
    return { type: "audio", url: data.publicUrl, name: "Voice message" };
  } catch (err: unknown) {
    Alert.alert("Upload failed", err instanceof Error ? err.message : "Could not send voice message.");
    return null;
  }
}
