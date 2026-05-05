// apps/mobile/app/profile/preview.tsx
// Preview how your profile card looks to others when matching — per sub-profile

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";

type PreviewMode = "romance" | "friends" | "business" | "events";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const CARD_WIDTH = Math.min(SCREEN_WIDTH * 0.9, 340);
const CARD_HEIGHT = Math.min(SCREEN_HEIGHT * 0.55, 400);

const MODES: { key: PreviewMode; label: string; color: string }[] = [
  { key: "romance", label: "Romance", color: Colors.romance.primary },
  { key: "friends", label: "Friends", color: Colors.friends.primary },
  { key: "business", label: "Business", color: Colors.business.primary },
  { key: "events", label: "Events", color: Colors.events.primary },
];

function getAge(birthday: string | Date | null): number | null {
  if (!birthday) return null;
  const d = typeof birthday === "string" ? new Date(birthday) : birthday;
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age >= 18 ? age : null;
}

export default function ProfilePreview() {
  const { i18n } = useTranslation();
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [activeMode, setActiveMode] = useState<PreviewMode>((mode as PreviewMode) || "romance");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        // 1) Try draft first (current form data from profile onboarding)
        const draft = await AsyncStorage.getItem("winkly_profile_draft");
        if (draft) {
          const parsed = JSON.parse(draft);
          setData(parsed);
          setLoading(false);
          return;
        }

        // 2) Fall back to Supabase
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user?.id) {
          setData(null);
          setLoading(false);
          return;
        }
        const uid = userData.user.id;

        const { data: up } = await supabase
          .from("user_profiles")
          .select("first_name, last_name, city, birthday, occupation, core_photos, main_photo_url")
          .eq("id", uid)
          .maybeSingle();

        const { data: subs } = await supabase
          .from("sub_profiles")
          .select("mode, bio, photos, interests, meta")
          .eq("user_id", uid);

        const corePhotos = Array.isArray((up as any)?.core_photos) ? (up as any).core_photos.filter(Boolean) : [];
        const mainPhoto = (up as any)?.main_photo_url ?? corePhotos[0] ?? null;

        const draftFromDb: Record<string, any> = {
          firstName: (up as any)?.first_name ?? "",
          lastName: (up as any)?.last_name ?? "",
          city: (up as any)?.city ?? "",
          birthday: (up as any)?.birthday ?? null,
          occupation: (up as any)?.occupation ?? "",
          corePhotos: corePhotos.length ? corePhotos : [mainPhoto].filter(Boolean),
          interestsRomance: [],
          relationshipGoalsRomance: [],
          romancePhotos: [],
          interestsFriends: [],
          meetupGoalsFriends: [],
          friendsPhotos: [],
          roleBusiness: "",
          companyBusiness: "",
          networkingGoalsBusiness: [],
          interestsBusiness: [],
          businessPhotos: [],
        };

        (subs ?? []).forEach((row: any) => {
          const photos = Array.isArray(row.photos) ? row.photos.filter(Boolean) : [];
          const meta = row.meta ?? {};
          const interests = Array.isArray(row.interests) ? row.interests : Array.isArray(meta.interests) ? meta.interests : [];
          if (row.mode === "romance") {
            draftFromDb.interestsRomance = interests;
            draftFromDb.relationshipGoalsRomance = Array.isArray(meta.relationship_goals) ? meta.relationship_goals : [];
            draftFromDb.romancePhotos = photos;
          }
          if (row.mode === "friends") {
            draftFromDb.interestsFriends = interests;
            draftFromDb.meetupGoalsFriends = Array.isArray(meta.meetup_goals) ? meta.meetup_goals : [];
            draftFromDb.friendsPhotos = photos;
          }
          if (row.mode === "business") {
            draftFromDb.roleBusiness = meta.role ?? "";
            draftFromDb.companyBusiness = meta.company ?? "";
            draftFromDb.networkingGoalsBusiness = Array.isArray(meta.networking_goals) ? meta.networking_goals : typeof meta.networking_goals === "string" && meta.networking_goals ? [meta.networking_goals] : [];
            draftFromDb.interestsBusiness = interests;
            draftFromDb.businessPhotos = photos;
          }
        });

        setData(draftFromDb);
      } catch (e) {
        console.warn("Profile preview load error", e);
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); router.back(); }}
            style={styles.backBtn}
            activeOpacity={0.9}
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Card preview</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primaryViolet} />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      </View>
    );
  }

  const firstName = (data?.firstName ?? "").trim();
  const cityRaw = (data?.city ?? "").trim();
  const city = cityRaw ? normalizeLocationDisplayString(cityRaw, i18n?.language ?? "en") : "";
  const birthday = data?.birthday ? new Date(data.birthday) : null;
  const age = getAge(birthday);
  // On matching cards we show first name only — never full name or account details
  const displayName = firstName || "Your first name";

  const getPhoto = (m: PreviewMode): string | null => {
    if (m === "events") {
      const core = data?.corePhotos;
      return (Array.isArray(core) ? core[0] : null) ?? null;
    }
    const key = m === "romance" ? "romancePhotos" : m === "friends" ? "friendsPhotos" : "businessPhotos";
    const arr = data?.[key];
    const first = Array.isArray(arr) ? arr[0] : null;
    if (first) return first;
    const core = data?.corePhotos;
    return (Array.isArray(core) ? core[0] : null) ?? null;
  };

  const occupation = (data?.occupation ?? "").trim();

  // Romance & Friends: first 3 of interests + goals combined
  const getChipItems = (m: PreviewMode): string[] => {
    if (m === "events" || m === "business") return [];
    const interests = m === "romance" ? (data?.interestsRomance ?? []) : (data?.interestsFriends ?? []);
    const goals = m === "romance" ? (data?.relationshipGoalsRomance ?? []) : (data?.meetupGoalsFriends ?? []);
    const combined = [...(Array.isArray(interests) ? interests : []), ...(Array.isArray(goals) ? goals : [])];
    return combined.slice(0, 3);
  };

  // Business: role, company, networking goals
  const getBusinessInfo = (): { role: string; company: string; goals: string[] } => {
    const role = (data?.roleBusiness ?? "").trim();
    const company = (data?.companyBusiness ?? "").trim();
    const goals = Array.isArray(data?.networkingGoalsBusiness) ? data.networkingGoalsBusiness : [];
    return { role, company, goals };
  };

  const photo = getPhoto(activeMode);
  const chipItems = getChipItems(activeMode);
  const businessInfo = getBusinessInfo();
  const modeColor = MODES.find((m) => m.key === activeMode)?.color ?? Colors.primaryViolet;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); router.back(); }}
          style={styles.backBtn}
          activeOpacity={0.9}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Card preview</Text>
        <View style={styles.placeholder} />
      </View>

      <Text style={styles.hint}>How you appear on matching cards</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {MODES.map((m) => (
          <TouchableOpacity
            key={m.key}
            onPress={() => { Haptics.selectionAsync(); setActiveMode(m.key); }}
            style={[styles.tab, activeMode === m.key && { backgroundColor: m.color + "20", borderColor: m.color }]}
          >
            <Text style={[styles.tabLabel, activeMode === m.key && { color: m.color, fontWeight: "700" }]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.cardContainer}>
          <View style={[styles.card, { borderColor: modeColor + "40" }]}>
            <View style={styles.mediaArea}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.cardImage} resizeMode="cover" />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="person" size={80} color={Colors.gray400} />
                </View>
              )}
            </View>
            <View style={styles.infoPanel}>
              <Text style={styles.nameAge}>
                {displayName}{age != null ? `, ${age}` : ""}
              </Text>
              {city ? <Text style={styles.city}>{city}</Text> : null}
              {occupation ? <Text style={styles.occupation}>{occupation}</Text> : null}
              {activeMode === "business" && (businessInfo.role || businessInfo.company || businessInfo.goals.length > 0) && (
                <View style={styles.businessRow}>
                  {(businessInfo.role || businessInfo.company) && (
                    <Text style={styles.businessText}>
                      {[businessInfo.role, businessInfo.company].filter(Boolean).join(" · ")}
                    </Text>
                  )}
                  {businessInfo.goals.length > 0 && (
                    <View style={styles.chipRow}>
                      {businessInfo.goals.slice(0, 3).map((g) => (
                        <View key={g} style={styles.chip}>
                          <Text style={styles.chipText}>{g}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
              {chipItems.length > 0 && (
                <View style={styles.chipRow}>
                  {chipItems.map((i) => (
                    <View key={i} style={styles.chip}>
                      <Text style={styles.chipText}>{i}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundMuted },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    ...Layout.topHeaderBar,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  headerTitle: { ...Typography.headerTitle, fontFamily: FontFamily.heading, color: Colors.textPrimary },
  placeholder: { width: 44 },
  hint: {
    ...Typography.caption,
    color: Colors.gray600,
    textAlign: "center",
    marginTop: 12,
    marginHorizontal: 20,
  },
  tabBar: { maxHeight: 48, marginTop: 8 },
  tabBarContent: { flexDirection: "row", paddingHorizontal: 16, gap: 8 },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Colors.gray200,
  },
  tabLabel: { ...Typography.caption, fontWeight: "600", color: Colors.gray600 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 80, alignItems: "center" },
  cardContainer: { alignItems: "center", justifyContent: "center" },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: Layout.radii.card,
    backgroundColor: Colors.white,
    overflow: "visible",
    borderWidth: 2,
    ...Shadow.card,
  },
  mediaArea: {
    width: "100%",
    flex: 1,
    backgroundColor: Colors.gray200,
    overflow: "hidden",
    borderTopLeftRadius: Layout.radii.card - 2,
    borderTopRightRadius: Layout.radii.card - 2,
  },
  cardImage: { width: "100%", height: "100%" },
  photoPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  infoPanel: {
    position: "absolute",
    top: "90%",
    left: 0,
    right: 0,
    padding: 16,
    paddingTop: 12,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderTopLeftRadius: Layout.radii.card,
    borderTopRightRadius: Layout.radii.card,
  },
  nameAge: {
    ...Typography.h2,
    fontFamily: FontFamily.heading,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  city: {
    ...Typography.body,
    color: Colors.gray600,
    marginBottom: 4,
  },
  occupation: {
    ...Typography.caption,
    color: Colors.gray600,
    marginBottom: 8,
  },
  businessRow: { marginBottom: 8 },
  businessText: {
    ...Typography.body,
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray300,
  },
  chipText: {
    ...Typography.caption,
    color: Colors.textPrimary,
  },
  overflowText: {
    ...Typography.caption,
    color: Colors.gray500,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  loadingText: { ...Typography.caption, color: Colors.gray600, marginTop: 10 },
});
