// ────────────────────────────────────────────────
// Winkly Onboarding: Business Profile Setup
// v7.0 – November 2025
// © Winkly Technologies UG (haftungsbeschränkt)
// Maintainer: Kateryna Shyshkalova
// Purpose: Set up company/brand information during Business Account onboarding
// ────────────────────────────────────────────────

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Routes } from "@/constants/routes";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { pickAndUploadLogo } from "@/lib/uploadLogo";

export default function ProfileBusiness() {
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const isEditFlow = edit === "1";

  // ───────────────────────────────
  // STATE
  // ───────────────────────────────
  const [businessName, setBusinessName] = useState("");
  const [location, setLocation] = useState("");
  const [area, setArea] = useState("");
  const [bio, setBio] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [inputTag, setInputTag] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ───────────────────────────────
  // IMAGE PICKER – Business Logo
  // ───────────────────────────────
  const pickLogo = async () => {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    Alert.alert("Permission denied", "Media access is required to upload logo.");
    return;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.9,
  });

  if (!result.canceled && result.assets.length > 0) {
    const localUri = result.assets[0].uri;
    setLogoUri(localUri); // show preview immediately

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const uploadedUrl = await pickAndUploadLogo(userData.user.id);
    if (uploadedUrl) setLogoUri(uploadedUrl); // replace preview with permanent URL
  }
};


  // ───────────────────────────────
  // TAGS HANDLER
  // ───────────────────────────────
  const addTag = () => {
    if (!inputTag.trim() || tags.length >= 10) return;
    const clean = inputTag.trim();
    if (!tags.includes(clean)) setTags([...tags, clean]);
    setInputTag("");
  };

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  // ───────────────────────────────
  // SAVE PROFILE TO SUPABASE
  // ───────────────────────────────
  const handleContinue = async () => {
    if (!businessName || !area || !bio) {
      Alert.alert("Incomplete", "Please fill all required fields.");
      return;
    }

    try {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Session expired. Please log in again.");

      const { error } = await supabase
        .from("business_profiles")
        .upsert(
          {
            id: userData.user.id,
            business_name: businessName,
            location,
            area,
            bio,
            tags,
            website,
            instagram,
            facebook,
            linkedin,
            logo_uri: logoUri,
          },
          { onConflict: "id" }
        );

      if (error) throw error;

      await AsyncStorage.setItem("winkly_business_setup", "true");

      if (isEditFlow) {
        router.back();
        return;
      }
      const { shouldSkipWinklyWorld } = await import("@/lib/introFlags");
      const skip = await shouldSkipWinklyWorld();
      if (skip) {
        router.replace(Routes.modeSelection);
      } else {
        router.replace("/(onboarding-personal)/winkly-world?variant=business");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  // ───────────────────────────────
  // UI
  // ───────────────────────────────
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: Colors.backgroundLight }}
    >
      <ScrollView
        contentContainerStyle={{
          padding: 24,
          paddingBottom: 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            ...Typography.h2,
            color: Colors.textPrimary,
            marginBottom: 16,
          }}
        >
          Set up your Business Profile 💼
        </Text>

        {/* Logo Picker */}
        <TouchableOpacity
          onPress={pickLogo}
          style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: "#F5F5F5",
            alignSelf: "center",
            marginBottom: 24,
            justifyContent: "center",
            alignItems: "center",
            borderWidth: 1,
            borderColor: Colors.gray300,
          }}
        >
          {logoUri ? (
            <Image
              source={{ uri: logoUri }}
              style={{ width: 120, height: 120, borderRadius: 60 }}
            />
          ) : (
            <Text style={{ color: Colors.gray500, fontSize: 32 }}>＋</Text>
          )}
        </TouchableOpacity>

        {/* Business Name (required) */}
        <Text style={[label, { marginBottom: 6 }]}>Business / Brand Name <Text style={{ color: Colors.errorRed, fontWeight: "700" }}>*</Text></Text>
        <TextInput
          placeholder="Business / Brand Name"
          value={businessName}
          onChangeText={setBusinessName}
          style={inputStyle}
        />

        {/* Location */}
        <Text style={label}>Location</Text>
        <TextInput
          placeholder="City, Country"
          value={location}
          onChangeText={setLocation}
          style={inputStyle}
        />

        {/* Area of Business (required) */}
        <Text style={[label, { marginBottom: 6 }]}>Area of Business <Text style={{ color: Colors.errorRed, fontWeight: "700" }}>*</Text></Text>
        <TextInput
          placeholder="e.g. Marketing, Tech, Wellness"
          value={area}
          onChangeText={setArea}
          style={inputStyle}
        />

        {/* Bio (required) */}
        <Text style={[label, { marginBottom: 6 }]}>About your business <Text style={{ color: Colors.errorRed, fontWeight: "700" }}>*</Text></Text>
        <TextInput
          placeholder="Describe your business..."
          value={bio}
          onChangeText={setBio}
          multiline
          style={[inputStyle, { height: 100, textAlignVertical: "top" }]}
        />

        {/* Tags */}
        <Text style={label}>Tags (up to 10)</Text>
        <View style={{ flexDirection: "row", marginBottom: 12 }}>
          <TextInput
            placeholder="Add tag"
            value={inputTag}
            onChangeText={setInputTag}
            style={[inputStyle, { flex: 1, marginRight: 8 }]}
          />
          <TouchableOpacity
            onPress={addTag}
            style={{
              backgroundColor: Colors.primaryViolet,
              borderRadius: Layout.radii.control,
              width: 40,
              height: 40,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#FFF", fontSize: 20 }}>＋</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 20 }}>
          {tags.map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => removeTag(t)}
              style={{
                backgroundColor: Colors.primaryViolet,
                borderRadius: 20,
                paddingVertical: 6,
                paddingHorizontal: 12,
                marginRight: 6,
                marginBottom: 6,
              }}
            >
              <Text style={{ color: "#FFF" }}>{t} ✕</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Links */}
        <Text style={label}>Website & Socials</Text>
        <TextInput
          placeholder="Website"
          value={website}
          onChangeText={setWebsite}
          style={inputStyle}
        />
        <TextInput
          placeholder="Instagram"
          value={instagram}
          onChangeText={setInstagram}
          style={inputStyle}
        />
        <TextInput
          placeholder="Facebook"
          value={facebook}
          onChangeText={setFacebook}
          style={inputStyle}
        />
        <TextInput
          placeholder="LinkedIn"
          value={linkedin}
          onChangeText={setLinkedin}
          style={inputStyle}
        />

        {/* Continue Button */}
        <TouchableOpacity
          onPress={handleContinue}
          disabled={loading}
          style={{
            backgroundColor: Colors.primaryViolet,
            borderRadius: Layout.radii.control,
            paddingVertical: 16,
            alignItems: "center",
            marginTop: 24,
            opacity: loading ? 0.7 : 1,
          }}
        >
          <Text style={{ ...Typography.button, color: Colors.accentYellow }}>
            {loading ? "Saving..." : "Continue"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ───────────────────────────────
// Shared styles
// ───────────────────────────────
const inputStyle = {
  borderWidth: 1,
  borderColor: Colors.gray400,
  borderRadius: Layout.radii.control,
  padding: 12,
  backgroundColor: "#FFF",
  marginBottom: 12,
};

const label = {
  ...Typography.body,
  color: Colors.gray700,
  marginBottom: 6,
};
