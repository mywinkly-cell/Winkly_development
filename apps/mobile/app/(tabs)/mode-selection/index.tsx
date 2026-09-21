// ────────────────────────────────────────────────
// Winkly Mode Selection Screen – Premium v8.1
// Route: /(tabs)/mode-selection — post-auth mode gateway
// Home tab: 2x2 mode grid — Romance / Friends / Business / Events → setActiveMode()
// ────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Alert,
  Dimensions,
  ScrollView,
  Pressable,
  Animated,
  Image,
} from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useModeContext } from "@/providers";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { radii } from "@/constants/design-system/radii";
import { ModeSelectionHeader } from "@/components/layout/ModeSelectionHeader";
import {
  computeModeProgressFromSubProfiles,
  getModeEntryBlockReason,
  getModeSubProfileEditRoute,
  type ModeProgressMap,
} from "@/lib/mode/subProfileProgress";
import {
  clearOnboardingSubProfileSkipped,
  getOnboardingSubProfileSkipped,
  type SkippedOnboardingMode,
} from "@/lib/introFlags";
import {
  fetchModeDiscoverCounts,
  formatModeDiscoverCount,
  type ModeDiscoverCounts,
} from "@/lib/discover/modeDiscoverCounts";
import { WeeklySparkNudge } from "@/components/mode/WeeklySparkNudge";
import { BusinessWaitlistSheet } from "@/components/mode/BusinessWaitlistSheet";
import { ComingSoonBadge } from "@/components/mode/ComingSoonBadge";
import { isModeAvailable } from "@/lib/modes/availability";
import {
  hasUnseenWeeklySpark,
  WEEKLY_SPARK_FOCUS_PARAM,
  WEEKLY_SPARK_FOCUS_VALUE,
} from "@/lib/ai/weeklySpark";
import type { Mode } from "@/types";

type ModeKey = Mode;

function getModeCardColors(theme: AppTheme): Record<ModeKey, string> {
  return {
    romance: theme.modeAccent("romance").primary,
    friends: theme.modeAccent("friends").primary,
    business: theme.modeAccent("business").primary,
    events: theme.modeAccent("events").primary,
  };
}

const EVENTS_ICON = require("@/assets/icons/events-icon_1.png");

const MODE_CONFIG: Record<
  ModeKey,
  { label: string; subProfileName: string; description: string; icon: keyof typeof Ionicons.glyphMap; iconImage?: number }
> = {
  romance: { label: "Romance", subProfileName: "Romance", description: "Find your spark", icon: "heart" },
  friends: { label: "Friends", subProfileName: "Friends", description: "Meet your people", icon: "people" },
  business: { label: "Business", subProfileName: "Business", description: "Grow your network", icon: "briefcase" },
  events: { label: "Events", subProfileName: "Events", description: "Join & create", icon: "calendar-outline", iconImage: EVENTS_ICON },
};

const SKIPPED_MODE_BANNER: Record<
  SkippedOnboardingMode,
  { message: string; cta: string }
> = {
  romance: { message: "Set up your Romance profile to start matching", cta: "Set up profile" },
  friends: { message: "Set up your Friends profile to start meeting people", cta: "Set up profile" },
  business: { message: "Set up your Business profile to start networking", cta: "Set up profile" },
};

type AccountType = "personal" | "business";

export default function ModeSelectionIndex() {
  const router = useRouter();
  const theme = useAppTheme();
  const modeCardColors = getModeCardColors(theme);
  const { context, setActiveMode, resetMode, refresh } = useModeContext();
  const [activeMode, setActiveModeLocal] = useState<ModeKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setProfilePhotoUri] = useState<string | null>(null);
  const [, setAccountType] = useState<AccountType>("personal");
  const [progress, setProgress] = useState<ModeProgressMap>({
    romance: 0,
    friends: 0,
    business: 0,
  });
  const [enteringMode, setEnteringMode] = useState<ModeKey | null>(null);
  const [discoverCounts, setDiscoverCounts] = useState<ModeDiscoverCounts>({});
  const [skippedMode, setSkippedMode] = useState<SkippedOnboardingMode | null>(null);
  const [showSparkNudge, setShowSparkNudge] = useState(false);
  const [waitlistVisible, setWaitlistVisible] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw userError;
      const userId = userData.user.id;

      const { data: profiles } = await supabase
        .from("sub_profiles")
        .select("mode, bio, photos, meta")
        .eq("user_id", userId);

      setProgress(computeModeProgressFromSubProfiles(profiles ?? []));
      setAccountType((context.account_type as AccountType) ?? "personal");

      const pendingSkip = await getOnboardingSubProfileSkipped();
      if (pendingSkip && computeModeProgressFromSubProfiles(profiles ?? [])[pendingSkip] >= 100) {
        await clearOnboardingSubProfileSkipped();
        setSkippedMode(null);
      } else {
        setSkippedMode(pendingSkip);
      }

      if ((context.account_type as AccountType) === "personal") {
        const { data: up } = await supabase
          .from("user_profiles")
          .select("main_photo_url, core_photos")
          .eq("id", userId)
          .maybeSingle();
        const photo = (up as any)?.main_photo_url ?? (Array.isArray((up as any)?.core_photos) ? (up as any).core_photos?.[0] : null);
        if (photo) setProfilePhotoUri(photo);
      } else {
        const { data: bp } = await supabase
          .from("business_profiles")
          .select("logo_uri")
          .or(`id.eq.${userId},user_id.eq.${userId}`)
          .limit(1)
          .maybeSingle();
        const logo = (bp as any)?.logo_uri;
        if (logo) setProfilePhotoUri(logo);
      }

      void fetchModeDiscoverCounts(userId)
        .then(setDiscoverCounts)
        .catch(() => setDiscoverCounts({}));
    } catch (err) {
      console.warn("Failed to load mode progress", err);
    } finally {
      setLoading(false);
    }
  }, [context.account_type]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      // Clear stale active_mode so RouteGuard does not fight the gateway after a bounce-back.
      if (context.active_mode) resetMode();
      load();
      // Force authz permissions to re-sync at the mode gateway so a newly
      // completed sub-profile is reflected before the user enters a mode.
      void refresh();
      // Re-check on every focus so the nudge disappears once the Spark is seen.
      void hasUnseenWeeklySpark().then(setShowSparkNudge);
    }, [load, refresh, resetMode, context.active_mode])
  );

  const handleModePress = async (mode: ModeKey) => {
    if (loading || enteringMode) return;

    if (!isModeAvailable(mode)) {
      Haptics.selectionAsync();
      setWaitlistVisible(true);
      return;
    }

    if (mode === "events") {
      Haptics.selectionAsync();
      setEnteringMode("events");
      setActiveModeLocal("events");
      setActiveMode("events");
      setEnteringMode(null);
      return;
    }

    setEnteringMode(mode);
    try {
      const permissions = (await refresh()) ?? context.permissions;
      const blockReason = getModeEntryBlockReason(mode, progress, permissions);
      const cfg = MODE_CONFIG[mode];

      if (blockReason === "not_enabled") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        const editRoute = getModeSubProfileEditRoute(mode);
        if (mode === "business") {
          Alert.alert(
            "Business mode not set up",
            "Turn on Business in your profile to unlock professional networking.",
            [
              { text: "Not now", style: "cancel" },
              { text: "Set up profile", onPress: () => router.push(editRoute as never) },
            ]
          );
        } else {
          Alert.alert(
            `${cfg.label} not set up`,
            `Turn on ${cfg.label} in your profile and save to unlock this mode.`,
            [
              { text: "Not now", style: "cancel" },
              { text: "Set up profile", onPress: () => router.push(editRoute as never) },
            ]
          );
        }
        return;
      }

      if (blockReason === "incomplete") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        const editRoute = getModeSubProfileEditRoute(mode);
        if (mode === "business") {
          Alert.alert(
            "Complete your Business profile",
            "Add a photo, bio, and networking goals to your Business sub-profile before using Business mode.",
            [
              { text: "Not now", style: "cancel" },
              { text: "Complete profile", onPress: () => router.push(editRoute as never) },
            ]
          );
        } else {
          Alert.alert(
            "Complete required fields",
            `Add main photo, bio, and goals to your ${cfg.subProfileName} sub-profile to use ${cfg.label} mode.`,
            [
              { text: "Not now", style: "cancel" },
              { text: "Complete now", onPress: () => router.push(editRoute as never) },
            ]
          );
        }
        return;
      }

      Haptics.selectionAsync();
      setActiveModeLocal(mode);
      setActiveMode(mode);
    } finally {
      setEnteringMode(null);
    }
  };

  return (
    <SafeScreenView edges={["left", "right"]} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ModeSelectionHeader showSettingsIcon />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: 100,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {skippedMode && isModeAvailable(skippedMode) && progress[skippedMode] < 100 ? (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              router.push(getModeSubProfileEditRoute(skippedMode) as never);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${SKIPPED_MODE_BANNER[skippedMode].cta}. ${SKIPPED_MODE_BANNER[skippedMode].message}`}
            style={{
              marginBottom: 20,
              padding: 14,
              borderRadius: 14,
              backgroundColor: theme.colors.primary + "12",
              borderWidth: 1,
              borderColor: theme.colors.primary + "44",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <Text style={{ ...theme.type.body, flex: 1, color: theme.colors.textPrimary, fontWeight: "600" }}>
              {SKIPPED_MODE_BANNER[skippedMode].message}
            </Text>
            <Text style={{ ...theme.type.caption, color: theme.colors.primary, fontWeight: "800" }}>
              {SKIPPED_MODE_BANNER[skippedMode].cta} →
            </Text>
          </Pressable>
        ) : null}

        {/* Additive Spark nudge — pulls toward the Planner only when an unseen weekly
            Spark exists. The mode grid below stays primary and unchanged. */}
        {showSparkNudge ? (
          <WeeklySparkNudge
            testID="weekly-spark-nudge"
            onPress={() => {
              router.push({
                pathname: "/(tabs)/planner",
                params: { [WEEKLY_SPARK_FOCUS_PARAM]: WEEKLY_SPARK_FOCUS_VALUE },
              });
            }}
          />
        ) : null}

        <Text
          testID="mode-selection-title"
          style={{
            ...theme.type.h2,
            fontSize: 24,
            fontWeight: "800",
            color: theme.colors.primary,
            fontFamily: theme.type.h1.fontFamily,
            textAlign: "center",
            marginBottom: 28,
          }}
        >
          What would you like to experience today?
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginHorizontal: -CARD_GAP / 2 }}>
          {(["romance", "friends", "business", "events"] as ModeKey[]).map((mode) => {
            const cfg = MODE_CONFIG[mode];
            const comingSoon = !isModeAvailable(mode);
            const ready =
              mode === "events" ||
              getModeEntryBlockReason(mode, progress, context.permissions) === null;
            return (
              <ModeCard
                key={mode}
                testID={`mode-card-${mode}`}
                label={cfg.label}
                description={cfg.description}
                discoverLine={comingSoon ? null : formatModeDiscoverCount(mode, discoverCounts[mode])}
                color={modeCardColors[mode]}
                icon={cfg.icon}
                iconImage={cfg.iconImage}
                active={activeMode === mode}
                ready={ready}
                comingSoon={comingSoon}
                busy={enteringMode === mode}
                onPress={() => void handleModePress(mode)}
              />
            );
          })}
        </View>
      </ScrollView>

      <BusinessWaitlistSheet visible={waitlistVisible} onClose={() => setWaitlistVisible(false)} />
    </SafeScreenView>
  );
}

type ModeCardProps = {
  testID?: string;
  label: string;
  description: string;
  discoverLine?: string | null;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconImage?: number;
  active: boolean;
  ready: boolean;
  /** Visible but not live yet: muted tile + "Coming soon" badge; press opens the waitlist. */
  comingSoon?: boolean;
  busy: boolean;
  onPress: () => void;
};

const CARD_GAP = 12;
const CARD_ICON_SIZE = 36;
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_SIZE = (SCREEN_WIDTH - 48 - CARD_GAP * 2) / 2;
const CARD_RADIUS = radii.lg + 8;
const CARD_PADDING = 24;
const ACTIVE_SCALE = 1.08;

function ModeCard({ testID, label, description, discoverLine, color, icon, iconImage, active, ready, comingSoon, busy, onPress }: ModeCardProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };

  // Premium 3D: neutral depth shadow (visible on all modes – fixes Romance/Friends)
  const depthShadow = {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 } as const,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 10,
  };

  return (
    <View
      style={{
        opacity: comingSoon || (ready && !busy) ? 1 : 0.72,
        transform: [{ scale: active ? ACTIVE_SCALE : 1 }],
        margin: CARD_GAP / 2,
      }}
    >
      <Pressable
        testID={testID}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        disabled={busy}
        android_ripple={{ color: "transparent" }}
        accessibilityRole="button"
        accessibilityLabel={
          comingSoon
            ? t("modes.comingSoonA11y", { mode: label })
            : ready
            ? `Enter ${label} mode. ${description}${discoverLine ? `. ${discoverLine}` : ""}`
            : `${label} mode locked. ${description}. Set up your profile to unlock.`
        }
        accessibilityState={{ selected: active, disabled: busy }}
      >
        <Animated.View
          style={[
            {
              width: CARD_SIZE,
              height: CARD_SIZE,
              borderRadius: CARD_RADIUS,
              backgroundColor: comingSoon ? theme.colors.backgroundMuted : color,
              transform: [{ scale: scaleAnim }],
              borderWidth: 1,
              borderColor: comingSoon ? theme.colors.border : "rgba(255,255,255,0.14)",
            },
            comingSoon ? null : depthShadow,
          ]}
        >
          <View
            style={{
              width: "100%",
              height: "100%",
              borderRadius: CARD_RADIUS,
              padding: CARD_PADDING,
              overflow: "hidden",
              borderWidth: active ? 3 : 0,
              borderColor: active ? "#FFFFFF" : "transparent",
              justifyContent: "space-between",
            }}
          >
            <View style={{ alignItems: "center", flex: 1, justifyContent: "center" }}>
              {comingSoon ? (
                <ComingSoonBadge style={{ position: "absolute", top: -theme.spacing.sm }} />
              ) : !ready ? (
                <Ionicons name="lock-closed" size={18} color="rgba(255,255,255,0.9)" style={{ position: "absolute", top: 0, right: 0 }} />
              ) : null}
              {iconImage ? (
                <Image source={iconImage} style={{ width: CARD_ICON_SIZE, height: CARD_ICON_SIZE, marginBottom: 12, tintColor: comingSoon ? theme.colors.textMuted : "#FFFFFF" }} resizeMode="contain" />
              ) : (
                <Ionicons name={icon} size={CARD_ICON_SIZE} color={comingSoon ? theme.colors.textMuted : "#FFFFFF"} style={{ marginBottom: 12 }} />
              )}
              <Text selectable={false} style={{ ...theme.type.h3, color: comingSoon ? theme.colors.textSecondary : "#FFFFFF", marginBottom: 4, textAlign: "center", fontFamily: theme.type.h1.fontFamily }}>
                {label}
              </Text>
              <Text selectable={false} style={{ ...theme.type.caption, color: comingSoon ? theme.colors.textMuted : "#FFFFFF", textAlign: "center", lineHeight: 18 }}>
                {description}
              </Text>
              {discoverLine ? (
                <Text
                  selectable={false}
                  style={{
                    ...theme.type.caption,
                    fontSize: 11,
                    color: "rgba(255,255,255,0.88)",
                    textAlign: "center",
                    marginTop: 6,
                    fontWeight: "600",
                  }}
                >
                  {discoverLine}
                </Text>
              ) : null}
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
}
