// ────────────────────────────────────────────────
// Winkly Onboarding: Business Profile Setup
// v8.0 – Step 1: business type → Step 2: profile form
// ────────────────────────────────────────────────

import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
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
import { Card, Chip, Input, PrimaryButton, TextButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
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
  const theme = useAppTheme();
  const styles = createStyles(theme);
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
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        style={styles.screen}
      >
        <Text style={styles.title}>What best describes you?</Text>
        <Text style={styles.subtitle}>
          This shapes your Winkly experience — discovery, offers, and how others find you.
        </Text>
        {BUSINESS_TYPE_PRIMARY_OPTIONS.map((opt) => (
          <Pressable key={opt.key} onPress={() => handlePrimaryType(opt.key)}>
            <Card style={styles.optionCard}>
              <Text style={styles.optionTitle}>{opt.label}</Text>
              <Text style={styles.optionHint}>{opt.hint}</Text>
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  if (step === "org_subtype") {
    return (
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        style={styles.screen}
      >
        <TextButton title="← Back" onPress={() => setStep("type")} style={styles.backLink} />
        <Text style={styles.title}>What kind of organisation?</Text>
        <Text style={styles.subtitle}>
          Pick the option that fits best — you can update this later.
        </Text>
        {BUSINESS_ORG_SUBTYPE_OPTIONS.map((opt) => (
          <Pressable key={opt.value} onPress={() => handleOrgSubtype(opt.value)}>
            <Card style={styles.optionCard}>
              <Text style={styles.optionTitle}>{opt.label}</Text>
              <Text style={styles.optionHint}>{opt.hint}</Text>
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {!isEditFlow && (
          <TextButton
            title="← Change profile type"
            onPress={() =>
              setStep(businessType === "individual_professional" ? "type" : "org_subtype")
            }
            style={styles.backLink}
          />
        )}

        <Text style={styles.title}>Set up your Business Profile 💼</Text>

        <Pressable onPress={pickLogo} style={styles.logoPicker}>
          {logoUri ? (
            <Image source={{ uri: logoUri }} style={{ width: 120, height: 120, borderRadius: 60 }} />
          ) : (
            <Text style={{ color: theme.colors.textMuted, fontSize: 32 }}>＋</Text>
          )}
        </Pressable>

        <Input label="Business / Brand Name *" placeholder="Business / Brand Name" value={businessName} onChangeText={setBusinessName} />
        <Input label="Location" placeholder="City, Country" value={location} onChangeText={setLocation} />
        <Input label="Area of Business *" placeholder="e.g. Marketing, Tech, Wellness" value={area} onChangeText={setArea} />
        <Input
          label="About your business *"
          placeholder="Describe your business..."
          value={bio}
          onChangeText={setBio}
          multiline
          style={{ height: 100, textAlignVertical: "top" }}
        />

        <Text style={styles.label}>Tags (up to 10)</Text>
        <View style={styles.tagInputRow}>
          <Input
            placeholder="Add tag"
            value={inputTag}
            onChangeText={setInputTag}
            containerStyle={{ flex: 1, marginBottom: 0, marginRight: theme.spacing.sm }}
          />
          <Pressable onPress={addTag} style={styles.addTagBtn}>
            <Text style={{ color: theme.colors.onPrimary, fontSize: 20 }}>＋</Text>
          </Pressable>
        </View>

        <View style={styles.tagRow}>
          {tags.map((t) => (
            <Chip key={t} label={`${t} ✕`} selected onPress={() => removeTag(t)} style={styles.tagChip} />
          ))}
        </View>

        <Text style={styles.label}>Website & Socials</Text>
        <Input placeholder="Website" value={website} onChangeText={setWebsite} />
        <Input placeholder="Instagram" value={instagram} onChangeText={setInstagram} />
        <Input placeholder="Facebook" value={facebook} onChangeText={setFacebook} />
        <Input placeholder="LinkedIn" value={linkedin} onChangeText={setLinkedin} />

        <PrimaryButton
          title={loading ? "Saving..." : "Continue"}
          onPress={handleContinue}
          disabled={loading}
          loading={loading}
          style={styles.continueBtn}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: AppTheme) {
  return {
    screen: { flex: 1, backgroundColor: theme.colors.background },
    scroll: { padding: theme.spacing.xl, paddingBottom: 100 },
    title: { ...theme.type.h2, fontFamily: theme.type.h2.fontFamily, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
    subtitle: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, marginBottom: theme.spacing.xxl },
    optionCard: { marginBottom: theme.spacing.md },
    optionTitle: { ...theme.type.bodyMedium, fontFamily: theme.type.bodyMedium.fontFamily, fontWeight: "700" as const, color: theme.colors.textPrimary },
    optionHint: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary, marginTop: theme.spacing.xxs },
    backLink: { paddingHorizontal: 0, alignSelf: "flex-start" as const, marginBottom: theme.spacing.md },
    logoPicker: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: theme.colors.backgroundMuted,
      alignSelf: "center" as const,
      marginBottom: theme.spacing.xxl,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    label: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs },
    tagInputRow: { flexDirection: "row" as const, marginBottom: theme.spacing.md, alignItems: "flex-start" as const },
    addTagBtn: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radii.md,
      width: 48,
      height: 48,
      justifyContent: "center" as const,
      alignItems: "center" as const,
    },
    tagRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, marginBottom: theme.spacing.xl },
    tagChip: { marginRight: theme.spacing.xs, marginBottom: theme.spacing.xs },
    continueBtn: { marginTop: theme.spacing.xl },
  };
}
