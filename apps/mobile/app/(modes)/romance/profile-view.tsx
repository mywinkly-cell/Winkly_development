// apps/mobile/app/(modes)/romance/profile-view.tsx
// ────────────────────────────────────────────────
// Winkly Romance Mode – Profile View (v7.1 AI)
// © 2025 Winkly Technologies UG (haftungsbeschränkt)
// Maintainer: Kateryna Shyshkalova
//
// Purpose:
//   • Full-screen view of another user's profile (Romance context)
//   • Uses public_profile_view + AI compatibility logic
//   • Reuses computeCompatibilityScore + buildMatchTags
//   • From Discover/Home/Matches you land here with ?id=USER_ID
// ────────────────────────────────────────────────

import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Alert,
} from "react-native";
import * as Linking from "expo-linking";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { Colors, Typography, Layout } from "@/constants/tokens";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { supabase } from "@/lib/supabase";
import { getProfileForMode } from "@/lib/access/profiles";
import {
  computeCompatibilityScore,
  buildMatchTags,
  type RomanceProfile,
} from "@/lib/ai/romanceInsights";

const { width } = Dimensions.get("window");

type ProfileRow = {
  id: string;
  first_name: string;
  last_name?: string | null;
  age?: number | null;
  city?: string | null;
  interests?: string[] | null;
  languages?: string[] | null;
  occupation?: string | null;
  bio_romance?: string | null;
  night_owl?: boolean | null;
  // Optional lifestyle / extra fields:
  lifestyle_smoking?: string | null;
  lifestyle_drinking?: string | null;
  lifestyle_pets?: string | null;
  lifestyle_kids?: string | null;
  lifestyle_fitness?: string | null;
  lifestyle_food?: string | null;
  lifestyle_religion?: string | null;
  // Media:
  core_photos?: (string | null)[];
  romance_photos?: (string | null)[];
  instagram?: string | null;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUUID(s: string | undefined): boolean {
  return typeof s === "string" && UUID_REGEX.test(s.trim());
}

export default function RomanceProfileView() {
  const { i18n } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [loading, setLoading] = useState(true);
  const [selfProfile, setSelfProfile] = useState<RomanceProfile | null>(null);
  const [targetProfile, setTargetProfile] = useState<ProfileRow | null>(null);

  // ────────────────────────────────────────────────
  // Load self + target profile from public_profile_view
  // ────────────────────────────────────────────────
  const loadData = async () => {
    if (!id || !isValidUUID(id)) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        setLoading(false);
        return;
      }

      // Self + target via mode-isolated access layer (public_profile_view)
      const [me, other] = await Promise.all([
        getProfileForMode("romance", userData.user.id, userData.user.id),
        getProfileForMode("romance", userData.user.id, id),
      ]);

      if (me) {
        setSelfProfile({
          id: String(me.id),
          first_name: me.first_name as string,
          age: (me.age as number | null) ?? undefined,
          city: (me.city as string | null) ?? undefined,
          interests: (me.interests as string[] | null) ?? (me.romance_interests as string[] | null) ?? [],
          languages: (me.languages as string[] | null) ?? [],
          occupation: (me.occupation as string | null) ?? undefined,
          bio_romance: (me.bio_romance as string | null) ?? undefined,
          compatibility: me.compatibility as number | undefined,
        });
      }

      if (other) {
        setTargetProfile(other as ProfileRow);
      }
    } catch (err) {
      console.warn("RomanceProfileView loadData error", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ────────────────────────────────────────────────
  // Derived data: AI compatibility, tags, photos
  // ────────────────────────────────────────────────
  const ai = useMemo(() => {
    if (!targetProfile) {
      return {
        score: 0,
        tags: [] as string[],
      };
    }

    const other: RomanceProfile = {
      id: targetProfile.id,
      first_name: targetProfile.first_name,
      age: targetProfile.age ?? undefined,
      city: targetProfile.city ?? undefined,
      interests: targetProfile.interests || [],
      languages: targetProfile.languages || [],
      occupation: targetProfile.occupation || undefined,
      bio_romance: targetProfile.bio_romance || undefined,
      compatibility: undefined,
    };

    const score = computeCompatibilityScore({
      self: selfProfile,
      other,
    });

    const tags = buildMatchTags({
      self: selfProfile,
      other,
    });

    return { score, tags };
  }, [selfProfile, targetProfile]);

  const photos: string[] = useMemo(() => {
    if (!targetProfile) return [];

    const romance = (targetProfile.romance_photos || []).filter(
      (p): p is string => !!p
    );
    const core = (targetProfile.core_photos || []).filter(
      (p): p is string => !!p
    );

    // Romance photos first, then core as fallback
    const combined = [...romance, ...core];

    // Avoid duplicates if same URLs appear in both
    return Array.from(new Set(combined));
  }, [targetProfile]);

  // ────────────────────────────────────────────────
  // Handlers
  // ────────────────────────────────────────────────
  const onBack = () => {
    router.back();
  };

  const onLike = async () => {
    if (!targetProfile) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { data, error } = await supabase.rpc("romance_like_profile", {
        current_user_id: userData.user.id,
        target_user_id: targetProfile.id,
      });
      if (error) throw error;

      const result = data as { liked: boolean; is_match?: boolean; chat_id?: string };
      if (result?.is_match && result?.chat_id) {
        Alert.alert("It's a match! 💖", "You both liked each other. Start chatting?", [
          { text: "Later" },
          { text: "Chat", onPress: () => router.push(`/chats/${result.chat_id}?matchBridge=1`) },
        ]);
      }
    } catch (err) {
      console.warn("Like from profile-view error", err);
      Alert.alert("Error", "Could not send like. Please try again.");
    }
  };

  const onOpenPlanner = () => {
    router.push("/planner" as any);
  };

  // ────────────────────────────────────────────────
  // Lifestyle chips helper
  // ────────────────────────────────────────────────
  const lifestyleChips = useMemo(() => {
    if (!targetProfile) return [] as string[];

    const chips: string[] = [];
    if (typeof targetProfile.night_owl === "boolean")
      chips.push(targetProfile.night_owl ? "Night owl" : "Early bird");
    if (targetProfile.lifestyle_smoking)
      chips.push(`Smoking: ${targetProfile.lifestyle_smoking}`);
    if (targetProfile.lifestyle_drinking)
      chips.push(`Drinking: ${targetProfile.lifestyle_drinking}`);
    if (targetProfile.lifestyle_pets)
      chips.push(`Pets: ${targetProfile.lifestyle_pets}`);
    if (targetProfile.lifestyle_kids)
      chips.push(`Kids: ${targetProfile.lifestyle_kids}`);
    if (targetProfile.lifestyle_fitness)
      chips.push(`Fitness: ${targetProfile.lifestyle_fitness}`);
    if (targetProfile.lifestyle_food)
      chips.push(`Food: ${targetProfile.lifestyle_food}`);
    if (targetProfile.lifestyle_religion)
      chips.push(`Religion: ${targetProfile.lifestyle_religion}`);

    return chips;
  }, [targetProfile]);

  // ────────────────────────────────────────────────
  // UI
  // ────────────────────────────────────────────────
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.backgroundLight,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color={Colors.primaryViolet} />
      </View>
    );
  }

  if (!targetProfile) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.backgroundLight,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Text style={{ ...Typography.body, color: Colors.gray700 }}>
          This profile is not available.
        </Text>
        <TouchableOpacity
          onPress={onBack}
          style={{
            marginTop: 16,
            paddingVertical: 10,
            paddingHorizontal: 20,
            borderRadius: Layout.radii.control,
            borderWidth: 1,
            borderColor: Colors.primaryViolet,
          }}
        >
          <Text
            style={{
              ...Typography.body,
              color: Colors.primaryViolet,
              fontWeight: "600",
            }}
          >
            Go back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const fullName =
    targetProfile.last_name && targetProfile.last_name.trim().length > 0
      ? `${targetProfile.first_name} ${targetProfile.last_name}`
      : targetProfile.first_name;

  const topPhoto = photos[0] || null;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
      {/* HEADER */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* LEFT: Back */}
        <TouchableOpacity
          onPress={onBack}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: Colors.gray100,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={Colors.textPrimary}
          />
        </TouchableOpacity>

        {/* CENTER: Logo */}
        <Image
          source={require("../../../assets/icons/winkly-logo.png")}
          resizeMode="contain"
          style={{ width: 120, height: 40 }}
        />

        {/* RIGHT: Planner */}
        <TouchableOpacity
          onPress={onOpenPlanner}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: Colors.gray100,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="calendar-outline"
            size={26}
            color={Colors.primaryViolet}
          />
        </TouchableOpacity>
      </View>

      {/* CONTENT */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: 120,
        }}
      >
        {/* MAIN PHOTO */}
        <View
          style={{
            width,
            height: width * 1.1,
            backgroundColor: Colors.gray200,
          }}
        >
          {topPhoto ? (
            <Image
              source={{ uri: topPhoto }}
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 40 }}>📷</Text>
            </View>
          )}
        </View>

        {/* SECONDARY PHOTOS (if any) */}
        {photos.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ paddingHorizontal: 16, marginTop: 12 }}
          >
            {photos.slice(1).map((uri) => (
              <View
                key={uri}
                style={{
                  width: 90,
                  height: 120,
                  borderRadius: 16,
                  overflow: "hidden",
                  backgroundColor: Colors.gray200,
                  marginRight: 10,
                }}
              >
                <Image
                  source={{ uri }}
                  style={{ width: "100%", height: "100%" }}
                />
              </View>
            ))}
          </ScrollView>
        )}

        {/* TEXT BLOCK */}
        <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
          {/* Name + Age + City */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text
                style={{
                  ...Typography.h1,
                  fontSize: 26,
                  color: Colors.textPrimary,
                }}
                numberOfLines={1}
              >
                {fullName}
                {targetProfile.age ? `, ${targetProfile.age}` : ""}
              </Text>
              <Text
                style={{
                  ...Typography.body,
                  color: Colors.gray700,
                }}
                numberOfLines={1}
              >
                {targetProfile.city?.trim()
                  ? normalizeLocationDisplayString(targetProfile.city, i18n?.language ?? "en")
                  : "Somewhere nearby"}
              </Text>
              {targetProfile.occupation && (
                <Text
                  style={{
                    ...Typography.caption,
                    color: Colors.gray600,
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  {targetProfile.occupation}
                </Text>
              )}
            </View>

            {/* AI Compatibility Badge */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                minWidth: 78,
                height: 40,
                borderRadius: 20,
                backgroundColor: Colors.accentMint,
                justifyContent: "center",
                paddingHorizontal: 10,
              }}
            >
              <SparklesIcon size={14} color="#003329" />
              <Text
                style={{
                  ...Typography.caption,
                  fontWeight: "700",
                  color: "#003329",
                }}
              >
                {ai.score}% match
              </Text>
            </View>
          </View>

          {/* AI Tags */}
          {ai.tags.length > 0 && (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                marginBottom: 10,
              }}
            >
              {ai.tags.slice(0, 4).map((tag) => (
                <View
                  key={tag}
                  style={{
                    borderRadius: 999,
                    backgroundColor: Colors.gray100,
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    marginRight: 6,
                    marginBottom: 6,
                  }}
                >
                  <Text
                    style={{
                      ...Typography.caption,
                      color: Colors.gray700,
                    }}
                  >
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Bio */}
          <View style={{ marginBottom: 16 }}>
            <Text
              style={{
                ...Typography.h3,
                color: Colors.textPrimary,
                marginBottom: 4,
              }}
            >
              About
            </Text>
            {targetProfile.bio_romance ? (
              <Text
                style={{
                  ...Typography.body,
                  color: Colors.gray800,
                  lineHeight: 20,
                }}
              >
                {targetProfile.bio_romance}
              </Text>
            ) : (
              <Text
                style={{
                  ...Typography.caption,
                  color: Colors.gray500,
                }}
              >
                No bio yet. Sometimes the best stories start with a simple
                “Hi” 😉
              </Text>
            )}
          </View>

          {/* Interests */}
          {targetProfile.interests && targetProfile.interests.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  ...Typography.h3,
                  color: Colors.textPrimary,
                  marginBottom: 4,
                }}
              >
                Interests
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                }}
              >
                {targetProfile.interests.map((interest) => (
                  <View
                    key={interest}
                    style={{
                      borderRadius: 999,
                      backgroundColor: Colors.gray100,
                      paddingVertical: 4,
                      paddingHorizontal: 8,
                      marginRight: 6,
                      marginBottom: 6,
                    }}
                  >
                    <Text
                      style={{
                        ...Typography.caption,
                        color: Colors.textPrimary,
                      }}
                    >
                      {interest}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Languages */}
          {targetProfile.languages && targetProfile.languages.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  ...Typography.h3,
                  color: Colors.textPrimary,
                  marginBottom: 4,
                }}
              >
                Languages
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {targetProfile.languages.map((lang) => (
                  <View
                    key={lang}
                    style={{
                      borderRadius: 999,
                      backgroundColor: Colors.gray100,
                      paddingVertical: 4,
                      paddingHorizontal: 8,
                      marginRight: 6,
                      marginBottom: 6,
                    }}
                  >
                    <Text
                      style={{
                        ...Typography.caption,
                        color: Colors.textPrimary,
                      }}
                    >
                      {lang}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Instagram */}
          {targetProfile.instagram?.trim() && (
            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  ...Typography.h3,
                  color: Colors.textPrimary,
                  marginBottom: 4,
                }}
              >
                Instagram
              </Text>
              <TouchableOpacity
                onPress={() => {
                  const h = targetProfile.instagram!.trim().replace(/^@/, "").replace(/.*instagram\.com\//, "").split("/")[0];
                  if (h) Linking.openURL(`https://instagram.com/${h}`);
                }}
              >
                <Text
                  style={{
                    ...Typography.body,
                    color: Colors.primaryViolet,
                    textDecorationLine: "underline",
                  }}
                >
                  {targetProfile.instagram.trim().startsWith("http") ? targetProfile.instagram.trim() : `instagram.com/${targetProfile.instagram.trim().replace(/^@/, "")}`}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Lifestyle */}
          {lifestyleChips.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  ...Typography.h3,
                  color: Colors.textPrimary,
                  marginBottom: 4,
                }}
              >
                Lifestyle
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {lifestyleChips.map((chip) => (
                  <View
                    key={chip}
                    style={{
                      borderRadius: 999,
                      backgroundColor: Colors.gray100,
                      paddingVertical: 4,
                      paddingHorizontal: 8,
                      marginRight: 6,
                      marginBottom: 6,
                    }}
                  >
                    <Text
                      style={{
                        ...Typography.caption,
                        color: Colors.textPrimary,
                      }}
                    >
                      {chip}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* LIKE BUTTON */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              marginTop: 8,
              marginBottom: 24,
            }}
          >
            <TouchableOpacity
              onPress={onLike}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 12,
                paddingHorizontal: 24,
                borderRadius: Layout.radii.control,
                backgroundColor: Colors.accentCoral,
                shadowColor: "#000",
                shadowOpacity: 0.18,
                shadowRadius: 8,
                elevation: 3,
              }}
            >
              <Ionicons name="heart" size={22} color="#FFF" />
              <Text
                style={{
                  ...Typography.body,
                  color: "#FFF",
                  marginLeft: 8,
                  fontWeight: "600",
                }}
              >
                Wink at {targetProfile.first_name}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
