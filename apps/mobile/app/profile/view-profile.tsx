// apps/mobile/app/profile/view-profile.tsx
// Read-only own profile — what others see per mode (core + sub-profiles).

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";
import { useAuth } from "@/providers";
import {
  getAgeFromBirthday,
  getOwnProfileCore,
  getOwnProfileMode,
} from "@/lib/access/profiles";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
import type { Mode } from "@/types";

type ViewMode = Extract<Mode, "romance" | "friends" | "business">;

const MODES: { key: ViewMode; label: string; color: string }[] = [
  { key: "romance", label: "Romance", color: Colors.romance.primary },
  { key: "friends", label: "Friends", color: Colors.friends.primary },
  { key: "business", label: "Business", color: Colors.business.primary },
];

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PHOTO_WIDTH = Math.min(SCREEN_WIDTH - 40, 360);

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function chipItemsForMode(
  mode: ViewMode,
  modeRow: Record<string, unknown> | null,
  meta: Record<string, unknown>
): string[] {
  if (mode === "romance") {
    const interests = asStringArray(modeRow?.interests);
    const goals = asStringArray(meta.relationship_goals ?? meta.relationship_goal);
    return [...interests, ...goals].slice(0, 8);
  }
  if (mode === "friends") {
    const interests = asStringArray(modeRow?.interests);
    const goals = asStringArray(meta.meetup_goals);
    const vibes = asStringArray(meta.vibe_tags);
    return [...interests, ...goals, ...vibes].slice(0, 8);
  }
  const role = String(meta.role ?? "").trim();
  const company = String(meta.company ?? "").trim();
  const goals = asStringArray(meta.networking_goals ?? meta.networking_goal);
  const skills = asStringArray(modeRow?.interests);
  return [role, company, ...goals, ...skills].filter(Boolean).slice(0, 8);
}

function photosForMode(
  mode: ViewMode,
  corePhotos: string[],
  modeRow: Record<string, unknown> | null
): string[] {
  const modePhotos = asStringArray(modeRow?.photos);
  const combined = [...modePhotos, ...corePhotos];
  return Array.from(new Set(combined));
}

export default function ViewProfile() {
  const router = useRouter();
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [activeMode, setActiveMode] = useState<ViewMode>("romance");
  const [core, setCore] = useState<Record<string, unknown> | null>(null);
  const [modeProfiles, setModeProfiles] = useState<
    Partial<Record<ViewMode, Record<string, unknown> | null>>
  >({});

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const [coreRow, romance, friends, business] = await Promise.all([
        getOwnProfileCore(user.id),
        getOwnProfileMode(user.id, "romance"),
        getOwnProfileMode(user.id, "friends"),
        getOwnProfileMode(user.id, "business"),
      ]);
      if (cancelled) return;
      setCore((coreRow as Record<string, unknown> | null) ?? null);
      setModeProfiles({
        romance: (romance as Record<string, unknown> | null) ?? null,
        friends: (friends as Record<string, unknown> | null) ?? null,
        business: (business as Record<string, unknown> | null) ?? null,
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const corePhotos = useMemo(
    () => asStringArray(core?.core_photos),
    [core?.core_photos]
  );
  const firstName = String(core?.first_name ?? "").trim();
  const lastName = String(core?.last_name ?? "").trim();
  const displayName = firstName || "Your first name";
  const age = getAgeFromBirthday(core?.birthday as string | null);
  const cityRaw = String(core?.city ?? "").trim();
  const city = cityRaw
    ? normalizeLocationDisplayString(cityRaw, i18n?.language ?? "en")
    : "";
  const occupation = String(core?.occupation ?? "").trim();
  const coreBio = String(core?.bio ?? "").trim();
  const languages = asStringArray(core?.languages);
  const activityPrefs = asStringArray(core?.activity_preferences);

  const activeModeRow = modeProfiles[activeMode] ?? null;
  const activeMeta = (activeModeRow?.meta as Record<string, unknown> | undefined) ?? {};
  const modeBio =
    String(activeModeRow?.bio ?? "").trim() ||
    (activeMode === "romance"
      ? String(activeMeta.what_you_value ?? "").trim()
      : activeMode === "business"
        ? String(activeMeta.networking_goal ?? "").trim()
        : "");
  const photos = photosForMode(activeMode, corePhotos, activeModeRow);
  const chips = chipItemsForMode(activeMode, activeModeRow, activeMeta);
  const modeColor = MODES.find((m) => m.key === activeMode)?.color ?? Colors.primaryViolet;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            router.back();
          }}
          style={styles.backBtn}
          activeOpacity={0.9}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your profile</Text>
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            router.push("/(onboarding-personal)/profile-core?edit=1");
          }}
          style={styles.editBtn}
          activeOpacity={0.9}
        >
          <Text style={styles.editText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>How others see you in each mode</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
      >
        {MODES.map((m) => (
          <TouchableOpacity
            key={m.key}
            onPress={() => {
              Haptics.selectionAsync();
              setActiveMode(m.key);
            }}
            style={[
              styles.tab,
              activeMode === m.key && {
                backgroundColor: m.color + "20",
                borderColor: m.color,
              },
            ]}
          >
            <Text
              style={[
                styles.tabLabel,
                activeMode === m.key && { color: m.color, fontWeight: "700" },
              ]}
            >
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primaryViolet} />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.photoStrip}
          >
            {(photos.length ? photos : [null]).map((uri, idx) => (
              <View key={uri ?? `empty-${idx}`} style={styles.photoFrame}>
                {uri ? (
                  <Image source={{ uri }} style={styles.photo} resizeMode="cover" />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Ionicons name="person" size={72} color={Colors.gray400} />
                  </View>
                )}
              </View>
            ))}
          </ScrollView>

          <View style={[styles.card, { borderColor: modeColor + "40" }]}>
            <Text style={styles.nameAge}>
              {displayName}
              {age != null ? `, ${age}` : ""}
            </Text>
            {lastName ? (
              <Text style={styles.fullNameHint}>Full name: {`${firstName} ${lastName}`.trim()}</Text>
            ) : null}
            {city ? <Text style={styles.meta}>{city}</Text> : null}
            {occupation ? <Text style={styles.meta}>{occupation}</Text> : null}

            {coreBio ? (
              <>
                <Text style={styles.sectionTitle}>About you</Text>
                <Text style={styles.body}>{coreBio}</Text>
              </>
            ) : null}

            {modeBio && modeBio !== coreBio ? (
              <>
                <Text style={styles.sectionTitle}>{MODES.find((m) => m.key === activeMode)?.label} bio</Text>
                <Text style={styles.body}>{modeBio}</Text>
              </>
            ) : null}

            {chips.length > 0 ? (
              <View style={styles.chipRow}>
                {chips.map((item) => (
                  <View key={item} style={[styles.chip, { borderColor: modeColor + "55" }]}>
                    <Text style={styles.chipText}>{item}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {activeMode === "romance" && asStringArray(activeModeRow?.lifestyle_tags).length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>Lifestyle</Text>
                <View style={styles.chipRow}>
                  {asStringArray(activeModeRow?.lifestyle_tags).map((tag) => (
                    <View key={tag} style={styles.chip}>
                      <Text style={styles.chipText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {activeMode === "friends" ? (
              <>
                {String(activeMeta.meetup_style ?? "").trim() ? (
                  <Text style={styles.metaLine}>
                    Meetup style: {String(activeMeta.meetup_style)}
                  </Text>
                ) : null}
                {String(activeMeta.availability ?? "").trim() ? (
                  <Text style={styles.metaLine}>
                    Availability: {String(activeMeta.availability)}
                  </Text>
                ) : null}
              </>
            ) : null}

            {languages.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>Languages</Text>
                <Text style={styles.body}>{languages.join(", ")}</Text>
              </>
            ) : null}

            {activityPrefs.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>Activity preferences</Text>
                <View style={styles.chipRow}>
                  {activityPrefs.map((item) => (
                    <View key={item} style={styles.chip}>
                      <Text style={styles.chipText}>{item}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {String(core?.instagram ?? "").trim() ? (
              <Text style={styles.metaLine}>Instagram: {String(core?.instagram)}</Text>
            ) : null}
          </View>
        </ScrollView>
      )}
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
  },
  headerTitle: {
    ...Typography.headerTitle,
    fontFamily: FontFamily.heading,
    color: Colors.textPrimary,
  },
  editBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primaryViolet,
  },
  editText: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "700" },
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
  scrollContent: { paddingBottom: 48 },
  photoStrip: { marginTop: 12 },
  photoFrame: {
    width: PHOTO_WIDTH,
    height: PHOTO_WIDTH * 1.15,
    marginHorizontal: 20,
    borderRadius: Layout.radii.card,
    overflow: "hidden",
    backgroundColor: Colors.gray200,
  },
  photo: { width: "100%", height: "100%" },
  photoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.gray100,
  },
  card: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: Layout.radii.card,
    backgroundColor: Colors.white,
    borderWidth: 2,
  },
  nameAge: {
    ...Typography.h2,
    fontFamily: FontFamily.heading,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  fullNameHint: { ...Typography.caption, color: Colors.gray500, marginBottom: 4 },
  meta: { ...Typography.body, color: Colors.gray600, marginBottom: 4 },
  metaLine: { ...Typography.caption, color: Colors.gray600, marginTop: 8 },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginTop: 14,
    marginBottom: 6,
  },
  body: { ...Typography.body, color: Colors.gray700, lineHeight: 22 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray300,
  },
  chipText: { ...Typography.caption, color: Colors.textPrimary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  loadingText: { ...Typography.caption, color: Colors.gray600, marginTop: 10 },
});
