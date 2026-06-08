import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";
import { supabase } from "@/lib/supabase";
import { validatePickerAsset } from "@/lib/mediaValidation";
import { CACHE_CONTROL_IMMUTABLE } from "@/lib/images/cdnImage";

/** Pick and upload a business offer hero image. Returns public URL or null. */
export async function pickAndUploadOfferImage(userId: string): Promise<string | null> {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Please allow access to your photo library.");
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.9,
    });

    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];
    const check = await validatePickerAsset(asset, "image");
    if (!check.ok) {
      Alert.alert("Image not allowed", check.reason ?? "Please pick a different image.");
      return null;
    }

    const response = await fetch(asset.uri);
    const blob = await response.blob();
    const filePath = `${userId}/offers/${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("business-logos")
      .upload(filePath, blob, {
        contentType: blob.type || "image/jpeg",
        cacheControl: CACHE_CONTROL_IMMUTABLE,
        upsert: true,
      });
    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage.from("business-logos").getPublicUrl(filePath);
    return publicData.publicUrl;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Please try again later.";
    console.error("Offer image upload error:", err);
    Alert.alert("Upload failed", msg);
    return null;
  }
}
