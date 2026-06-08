// ────────────────────────────────────────────────
// Winkly Onboarding: Business Profile Setup
// v8.0 – Step 1: business type → Step 2: profile form
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
import { trackOnboardingCompleted } from "@/lib/analytics/events";
import type { BusinessProfileType } from "@/types";
import {
  BUSINESS_ORG_SUBTYPE_OPTIONS,
  BUSINESS_TYPE_PRIMARY_OPTIONS,
  type BusinessTypeStep,
} from "@/lib/business/businessTypes";

export default function ProfileBusiness() {
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const isEditFlow = edit === "1";

  const [step, setStep] = useState<BusinessTypeStep>(isEditFlow ? "profile" : "type");
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessProfileType>("brand");
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
      setLogoUri(localUri);

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const uploadedUrl = await pickAndUploadLogo(userData.user.id);
      if (uploadedUrl) setLogoUri(uploadedUrl);
    }
  };

  const addTag = () => {
    if (!inputTag.trim() || tags.length >= 10) return;
    const clean = inputTag.trim();
    if (!tags.includes(clean)) setTags([...tags, clean]);
    setInputTag("");
  };

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const handlePrimaryType = (key: "professional" | "organisation") => {
    if (key === "professional") {
      setBusinessType("individual_professional");
      setStep("profile");
    } else {
      setStep("org_subtype");
    }
  };

  const handleOrgSubtype = (value: BusinessProfileType) => {
    setBusinessType(value);
    setStep("profile");
  };

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
            business_type: businessType,
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
        trackOnboardingCompleted({ account_type: "business" });
        router.replace(Routes.modeSelection);
      } else {
        router.replace("/(onboarding-personal)/winkly-world?variant=business");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  };

  if (step === "type") {
    return (
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, backgroundColor: Colors.backgroundLight }}
      >
        <Text style={{ ...Typography.h2, color: Colors.textPrimary, marginBottom: 8 }}>
          What best describes you?
        </Text>
        <Text style={{ ...Typography.body, color: Colors.gray600, marginBottom: 24 }}>
          This shapes your Winkly experience — discovery, offers, and how others find you.
        </Text>
        {BUSINESS_TYPE_PRIMARY_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            onPress={() => handlePrimaryType(opt.key)}
            style={{
              borderWidth: 1,
              borderColor: Colors.gray300,
              backgroundColor: "#FFF",
              borderRadius: 16,
              padding: 18,
              marginBottom: 12,
            }}
            activeOpacity={0.9}
          >
            <Text style={{ fontWeight: "700", fontSize: 17, color: Colors.textPrimary }}>{opt.label}</Text>
            <Text style={{ color: Colors.gray600, fontSize: 14, marginTop: 4 }}>{opt.hint}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  if (step === "org_subtype") {
    return (
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, backgroundColor: Colors.backgroundLight }}
      >
        <TouchableOpacity onPress={() => setStep("type")} style={{ marginBottom: 16 }}>
          <Text style={{ color: Colors.primaryViolet, fontWeight: "600" }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ ...Typography.h2, color: Colors.textPrimary, marginBottom: 8 }}>
          What kind of organisation?
        </Text>
        <Text style={{ ...Typography.body, color: Colors.gray600, marginBottom: 24 }}>
          Pick the option that fits best — you can update this later.
        </Text>
        {BUSINESS_ORG_SUBTYPE_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            onPress={() => handleOrgSubtype(opt.value)}
            style={{
              borderWidth: 1,
              borderColor: Colors.gray300,
              backgroundColor: "#FFF",
              borderRadius: 16,
              padding: 18,
              marginBottom: 12,
            }}
            activeOpacity={0.9}
          >
            <Text style={{ fontWeight: "700", fontSize: 17, color: Colors.textPrimary }}>{opt.label}</Text>
            <Text style={{ color: Colors.gray600, fontSize: 14, marginTop: 4 }}>{opt.hint}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: Colors.backgroundLight }}
    >
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {!isEditFlow && (
          <TouchableOpacity
            onPress={() =>
              setStep(businessType === "individual_professional" ? "type" : "org_subtype")
            }
            style={{ marginBottom: 12 }}
          >
            <Text style={{ color: Colors.primaryViolet, fontWeight: "600" }}>← Change profile type</Text>
          </TouchableOpacity>
        )}

        <Text style={{ ...Typography.h2, color: Colors.textPrimary, marginBottom: 16 }}>
          Set up your Business Profile 💼
        </Text>

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
            <Image source={{ uri: logoUri }} style={{ width: 120, height: 120, borderRadius: 60 }} />
          ) : (
            <Text style={{ color: Colors.gray500, fontSize: 32 }}>＋</Text>
          )}
        </TouchableOpacity>

        <Text style={[label, { marginBottom: 6 }]}>
          Business / Brand Name <Text style={{ color: Colors.errorRed, fontWeight: "700" }}>*</Text>
        </Text>
        <TextInput
          placeholder="Business / Brand Name"
          value={businessName}
          onChangeText={setBusinessName}
          style={inputStyle}
        />

        <Text style={[label, { marginBottom: 6 }]}>Location</Text>
        <TextInput
          placeholder="City, Country"
          value={location}
          onChangeText={setLocation}
          style={inputStyle}
        />

        <Text style={[label, { marginBottom: 6 }]}>
          Area of Business <Text style={{ color: Colors.errorRed, fontWeight: "700" }}>*</Text>
        </Text>
        <TextInput
          placeholder="e.g. Marketing, Tech, Wellness"
          value={area}
          onChangeText={setArea}
          style={inputStyle}
        />

        <Text style={[label, { marginBottom: 6 }]}>
          About your business <Text style={{ color: Colors.errorRed, fontWeight: "700" }}>*</Text>
        </Text>
        <TextInput
          placeholder="Describe your business..."
          value={bio}
          onChangeText={setBio}
          multiline
          style={[inputStyle, { height: 100, textAlignVertical: "top" }]}
        />

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

        <Text style={label}>Website & Socials</Text>
        <TextInput placeholder="Website" value={website} onChangeText={setWebsite} style={inputStyle} />
        <TextInput placeholder="Instagram" value={instagram} onChangeText={setInstagram} style={inputStyle} />
        <TextInput placeholder="Facebook" value={facebook} onChangeText={setFacebook} style={inputStyle} />
        <TextInput placeholder="LinkedIn" value={linkedin} onChangeText={setLinkedin} style={inputStyle} />

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
