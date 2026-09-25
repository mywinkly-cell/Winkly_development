// apps/mobile/app/profile/view-profile.tsx
// Read-only own profile — preview how others see you in each mode.

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { Chip, Header, TextButton } from "@/components/ds";
import { useAppTheme, type AppTheme, type ModeName } from "@/constants/design-system";
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

const MODES: { key: PublicProfileMode }[] = [
  { key: "romance" },
  { key: "friends" },
  { key: "business" },
  { key: "events" },
];

export default function ViewProfile() {
  const router = useRouter();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const theme = useAppTheme();
  const styles = createStyles(theme);
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

  const modeColor = theme.modeAccent(activeMode as ModeName).primary;

  const coreForView = useMemo(
    () => core ?? emptyPublicCoreProfile(),
    [core]
  );

  return (
    <View style={styles.screen}>
      <Header
        title={t("profile.preview.title")}
        onBack={() => {
          Haptics.selectionAsync();
          router.back();
        }}
        trailing={
          <TextButton
            title={t("common.edit")}
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/(onboarding-personal)/profile-core?edit=1");
            }}
            style={styles.editBtn}
          />
        }
      />

      <Text style={styles.hint}>{t("profile.preview.hint")}</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
      >
        {MODES.map((m) => (
          <Chip
            key={m.key}
            label={t(`modes.${m.key}`)}
            mode={m.key as ModeName}
            selected={activeMode === m.key}
            onPress={() => {
              Haptics.selectionAsync();
              setActiveMode(m.key);
            }}
          />
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>{t("common.loading")}</Text>
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

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.backgroundMuted },
    editBtn: { paddingHorizontal: 0 },
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
    scrollContent: { paddingBottom: theme.spacing.massive },
    center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
    loadingText: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary, marginTop: theme.spacing.sm },
  });
}
