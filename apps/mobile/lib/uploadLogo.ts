// ────────────────────────────────────────────────
// Winkly Storage Helper: uploadLogo.ts
// v7.0 – November 2025
// © Winkly Technologies UG (haftungsbeschränkt)
// Maintainer: Kateryna Shyshkalova
// Purpose: Upload business logo to Supabase Storage
// and save public URL into business_profiles table.
// ────────────────────────────────────────────────

import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { Alert } from "react-native";
import { validatePickerAsset } from "@/lib/mediaValidation";
import { CACHE_CONTROL_IMMUTABLE } from "@/lib/images/cdnImage";

/**
 * Pick and upload a business logo.
 * Returns the public URL string or null on error.
 */
export async function pickAndUploadLogo(userId: string): Promise<string | null> {
  try {
    // 1️⃣ Request permissions
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Please allow access to your photo library.");
      return null;
    }

    // 2️⃣ Pick an image
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];

    // 2️⃣.5 Validate before any network call (size + MIME)
    const check = await validatePickerAsset(asset, "image");
    if (!check.ok) {
      Alert.alert("Logo not allowed", check.reason ?? "Please pick a different image.");
      return null;
    }

    const fileUri = asset.uri;

    // 3️⃣ Convert to Blob
    const response = await fetch(fileUri);
    const blob = await response.blob();

    // 4️⃣ Upload to Supabase Storage
    const filePath = `${userId}/${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("business-logos")
      .upload(filePath, blob, { contentType: blob.type || "image/jpeg", cacheControl: CACHE_CONTROL_IMMUTABLE, upsert: true });

    if (uploadError) throw uploadError;

    // 5️⃣ Retrieve public URL
    const { data: publicData } = supabase.storage
      .from("business-logos")
      .getPublicUrl(filePath);

    const publicUrl = publicData.publicUrl;

    // 6️⃣ Save logo URL into business_profiles
    const { error: dbError } = await supabase
      .from("business_profiles")
      .update({ logo_uri: publicUrl })
      .eq("id", userId);

    if (dbError) throw dbError;

    Alert.alert("Uploaded", "Logo uploaded successfully!");
    return publicUrl;
  } catch (err: any) {
    console.error("Logo upload error:", err);
    Alert.alert("Upload failed", err.message ?? "Please try again later.");
    return null;
  }
}
