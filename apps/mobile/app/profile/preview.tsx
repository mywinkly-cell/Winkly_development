// apps/mobile/app/profile/preview.tsx
// Preview how your profile card looks to others when matching — per sub-profile

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
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
import { Chip, Header } from "@/components/ds";
import { useAppTheme, type AppTheme, type ModeName } from "@/constants/design-system";
import { supabase } from "@/lib/supabase";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";

type PreviewMode = "romance" | "friends" | "business" | "events";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const CARD_WIDTH = Math.min(SCREEN_WIDTH * 0.9, 340);
const CARD_HEIGHT = Math.min(SCREEN_HEIGHT * 0.55, 400);

const MODES: { key: PreviewMode }[] = [
  { key: "romance" },
  { key: "friends" },
  { key: "business" },
  { key: "events" },
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
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
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

        // birthday is intentionally NOT selected from user_profiles: the raw DOB
        // column is locked down at the API layer. The owner reads their own date
        // of birth only through the get_my_birthday() RPC, which is keyed on
        // auth.uid(). Only the derived age is ever shown on the preview card.
        const { data: up } = await supabase
          .from("user_profiles")
          .select("first_name, last_name, city, occupation, core_photos, main_photo_url")
          .eq("id", uid)
          .maybeSingle();

        const { data: myBirthdayIso } = await supabase.rpc("get_my_birthday");

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
          birthday: (myBirthdayIso as string | null) ?? null,
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
        <Header title={t("profile.preview.cardTitle")} onBack={() => { Haptics.selectionAsync(); router.back(); }} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>{t("common.loading")}</Text>
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
  const displayName = firstName || t("profile.preview.firstNameFallback");

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
  const modeColor = theme.modeAccent(activeMode as ModeName).primary;

  return (
    <View style={styles.screen}>
      <Header title={t("profile.preview.cardTitle")} onBack={() => { Haptics.selectionAsync(); router.back(); }} />

      <Text style={styles.hint}>{t("profile.preview.cardHint")}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {MODES.map((m) => (
          <Chip
            key={m.key}
            label={t(`modes.${m.key}`)}
            mode={m.key as ModeName}
            selected={activeMode === m.key}
            onPress={() => { Haptics.selectionAsync(); setActiveMode(m.key); }}
          />
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
                  <Ionicons name="person" size={80} color={theme.colors.textMuted} />
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

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.backgroundMuted },
    hint: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
      textAlign: "center",
      marginTop: theme.spacing.md,
      marginHorizontal: theme.spacing.xl,
    },
    tabBar: { maxHeight: 48, marginTop: theme.spacing.sm },
    tabBarContent: { flexDirection: "row", paddingHorizontal: theme.spacing.lg, gap: theme.spacing.sm },
    scroll: { flex: 1 },
    scrollContent: { padding: theme.spacing.xl, paddingBottom: 80, alignItems: "center" },
    cardContainer: { alignItems: "center", justifyContent: "center" },
    card: {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
      overflow: "visible",
      borderWidth: 2,
      ...theme.elevation(1),
    },
    mediaArea: {
      width: "100%",
      flex: 1,
      backgroundColor: theme.colors.border,
      overflow: "hidden",
      borderTopLeftRadius: theme.radii.lg - 2,
      borderTopRightRadius: theme.radii.lg - 2,
    },
    cardImage: { width: "100%", height: "100%" },
    photoPlaceholder: {
      width: "100%",
      height: "100%",
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    infoPanel: {
      position: "absolute",
      top: "90%",
      left: 0,
      right: 0,
      padding: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      backgroundColor: "rgba(255,255,255,0.95)",
      borderTopLeftRadius: theme.radii.lg,
      borderTopRightRadius: theme.radii.lg,
    },
    nameAge: {
      ...theme.type.h2,
      fontFamily: theme.type.h2.fontFamily,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.xxs,
    },
    city: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.xxs,
    },
    occupation: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.sm,
    },
    businessRow: { marginBottom: theme.spacing.sm },
    businessText: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.xs,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      alignItems: "center",
    },
    chip: {
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
    },
    chipText: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textPrimary,
    },
    center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
    loadingText: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary, marginTop: theme.spacing.sm },
  });
}
