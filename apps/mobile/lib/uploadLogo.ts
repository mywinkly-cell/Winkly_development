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
    const fileUri = result.assets[0].uri;

    // 3️⃣ Convert to Blob
    const response = await fetch(fileUri);
    const blob = await response.blob();

    // 4️⃣ Upload to Supabase Storage
    const filePath = `${userId}/${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("business-logos")
      .upload(filePath, blob, { upsert: true });

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
