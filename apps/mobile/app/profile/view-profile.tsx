// apps/mobile/app/profile/view-profile.tsx
// Read-only own profile — preview how others see you in each mode.

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";
import { useAuth } from "@/providers";
import { getOwnProfileMode } from "@/lib/access/profiles";
import {
  loadPublicCoreProfile,
  normalizeModeProfileRow,
  emptyPublicCoreProfile,
  type PublicCoreProfile,
  type PublicModeProfileRow,
  type PublicProfileMode,
} from "@/lib/profile/publicModeProfile";
import { ModeProfilePublicView } from "@/components/profile/ModeProfilePublicView";

const MODES: { key: PublicProfileMode; label: string; color: string }[] = [
  { key: "romance", label: "Romance", color: Colors.romance.primary },
  { key: "friends", label: "Friends", color: Colors.friends.primary },
  { key: "business", label: "Business", color: Colors.business.primary },
  { key: "events", label: "Events", color: Colors.events.primary },
];

export default function ViewProfile() {
  const router = useRouter();
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [activeMode, setActiveMode] = useState<PublicProfileMode>("romance");
  const [core, setCore] = useState<PublicCoreProfile | null>(null);
  const [modeProfiles, setModeProfiles] = useState<
    Partial<Record<Exclude<PublicProfileMode, "events">, PublicModeProfileRow | null>>
  >({});

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const uid = user.id;
      const [coreRow, romance, friends, business] = await Promise.all([
        loadPublicCoreProfile(uid),
        getOwnProfileMode(uid, "romance"),
        getOwnProfileMode(uid, "friends"),
        getOwnProfileMode(uid, "business"),
      ]);

      if (cancelled) return;

      setCore(coreRow);
      setModeProfiles({
        romance: normalizeModeProfileRow("romance", romance as Record<string, unknown> | null),
        friends: normalizeModeProfileRow("friends", friends as Record<string, unknown> | null),
        business: normalizeModeProfileRow("business", business as Record<string, unknown> | null),
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const activeModeRow =
    activeMode === "events" ? null : (modeProfiles[activeMode] ?? null);

  const modeColor = MODES.find((m) => m.key === activeMode)?.color ?? Colors.primaryViolet;

  const coreForView = useMemo(
    () => core ?? emptyPublicCoreProfile(),
    [core]
  );

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
        <Text style={styles.headerTitle}>Profile preview</Text>
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
          <ModeProfilePublicView
            mode={activeMode}
            core={coreForView}
            modeRow={activeModeRow}
            locale={i18n?.language ?? "en"}
            showPrivacyHints
            modeColor={modeColor}
          />
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  loadingText: { ...Typography.caption, color: Colors.gray600, marginTop: 10 },
});
