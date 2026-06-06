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
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useModeContext } from "@/providers";
import { Colors, Typography, FontFamily } from "@/constants/tokens";
import { ModeSelectionHeader } from "@/components/layout/ModeSelectionHeader";
import {
  computeModeProgressFromSubProfiles,
  getModeEntryBlockReason,
  getModeSubProfileEditRoute,
  type ModeProgressMap,
} from "@/lib/mode/subProfileProgress";
import type { Mode } from "@/types";

type ModeKey = Mode;

const MODE_CARD_COLORS: Record<ModeKey, string> = {
  romance: Colors.romance.primary,
  friends: Colors.friends.primary,
  business: Colors.business.primary,
  events: Colors.events.primary,
};

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

type AccountType = "personal" | "business";

export default function ModeSelectionIndex() {
  const router = useRouter();
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
    }, [load, refresh, resetMode, context.active_mode])
  );

  const handleModePress = async (mode: ModeKey) => {
    if (loading || enteringMode) return;

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
    <SafeScreenView edges={["left", "right"]} style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
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
        <Text
          testID="mode-selection-title"
          style={{
            ...Typography.h2,
            fontSize: 24,
            fontWeight: "800",
            color: Colors.primaryViolet,
            fontFamily: FontFamily.heading,
            textAlign: "center",
            marginBottom: 28,
          }}
        >
          What would you like to experience today?
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginHorizontal: -CARD_GAP / 2 }}>
          {(["romance", "friends", "business", "events"] as ModeKey[]).map((mode) => {
            const cfg = MODE_CONFIG[mode];
            const ready =
              mode === "events" ||
              getModeEntryBlockReason(mode, progress, context.permissions) === null;
            return (
              <ModeCard
                key={mode}
                testID={`mode-card-${mode}`}
                label={cfg.label}
                description={cfg.description}
                color={MODE_CARD_COLORS[mode]}
                icon={cfg.icon}
                iconImage={cfg.iconImage}
                active={activeMode === mode}
                ready={ready}
                busy={enteringMode === mode}
                onPress={() => void handleModePress(mode)}
              />
            );
          })}
        </View>
      </ScrollView>

    </SafeScreenView>
  );
}

type ModeCardProps = {
  testID?: string;
  label: string;
  description: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconImage?: number;
  active: boolean;
  ready: boolean;
  busy: boolean;
  onPress: () => void;
};

const CARD_GAP = 12;
const CARD_ICON_SIZE = 36;
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_SIZE = (SCREEN_WIDTH - 48 - CARD_GAP * 2) / 2;
const CARD_RADIUS = 28;
const CARD_PADDING = 24;
const ACTIVE_SCALE = 1.08;

function ModeCard({ testID, label, description, color, icon, iconImage, active, ready, busy, onPress }: ModeCardProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };

  // Premium 3D: neutral depth shadow (visible on all modes – fixes Romance/Friends)
  const depthShadow = {
    shadowColor: Colors.softBlack,
    shadowOffset: { width: 0, height: 4 } as const,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 10,
  };

  return (
    <View
      style={{
        opacity: ready && !busy ? 1 : 0.72,
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
      >
        <Animated.View
          style={[
            {
              width: CARD_SIZE,
              height: CARD_SIZE,
              borderRadius: CARD_RADIUS,
              backgroundColor: color,
              transform: [{ scale: scaleAnim }],
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.14)",
            },
            depthShadow,
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
              borderColor: active ? Colors.white : "transparent",
              justifyContent: "space-between",
            }}
          >
            <View style={{ alignItems: "center", flex: 1, justifyContent: "center" }}>
              {!ready ? (
                <Ionicons name="lock-closed" size={18} color="rgba(255,255,255,0.9)" style={{ position: "absolute", top: 0, right: 0 }} />
              ) : null}
              {iconImage ? (
                <Image source={iconImage} style={{ width: CARD_ICON_SIZE, height: CARD_ICON_SIZE, marginBottom: 12, tintColor: Colors.white }} resizeMode="contain" />
              ) : (
                <Ionicons name={icon} size={CARD_ICON_SIZE} color={Colors.white} style={{ marginBottom: 12 }} />
              )}
              <Text selectable={false} style={{ ...Typography.h3, color: Colors.white, marginBottom: 4, textAlign: "center", fontFamily: FontFamily.heading }}>
                {label}
              </Text>
              <Text selectable={false} style={{ ...Typography.caption, color: Colors.white, textAlign: "center", lineHeight: 18 }}>
                {description}
              </Text>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
}
