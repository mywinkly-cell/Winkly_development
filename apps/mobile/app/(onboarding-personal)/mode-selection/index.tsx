// ────────────────────────────────────────────────
// Winkly Mode Selection Screen – Premium v8.1
// Home tab: 2x2 mode grid
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
import { ModeSelectionBottomBar } from "@/components/layout/ModeSelectionBottomBar";

type ModeKey = "romance" | "friends" | "business" | "events";

type ModeProgress = {
  romance: number;
  friends: number;
  business: number;
  events: number;
};

const MODE_CARD_COLORS: Record<ModeKey, string> = {
  romance: "#E83838",
  friends: "#FF9100",
  business: "#007AFF",
  events: "#9D33FF",
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
  const { context, setActiveMode } = useModeContext();
  const [activeMode, setActiveModeLocal] = useState<ModeKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setProfilePhotoUri] = useState<string | null>(null);
  const [, setAccountType] = useState<AccountType>("personal");
  const [progress, setProgress] = useState<ModeProgress>({
    romance: 0,
    friends: 0,
    business: 0,
    events: 100,
  });

  const load = useCallback(async () => {
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw userError;
      const userId = userData.user.id;

      const { data: profiles } = await supabase
        .from("sub_profiles")
        .select("mode, bio, photos, meta")
        .eq("user_id", userId);

      const p: ModeProgress = { romance: 0, friends: 0, business: 0, events: 100 };

      (profiles ?? []).forEach((row: { mode: string; bio: string | null; photos: string[] | null; meta?: Record<string, unknown> | null }) => {
        const hasBio = !!(row.bio?.trim?.());
        const hasPhotos = Array.isArray(row.photos) && row.photos.filter(Boolean).length > 0;
        const meta = row.meta as Record<string, unknown> | null | undefined;
        const hasGoals =
          row.mode === "romance"
            ? Array.isArray(meta?.relationship_goals) && (meta.relationship_goals as unknown[]).length > 0
            : row.mode === "friends"
              ? Array.isArray(meta?.meetup_goals) && (meta.meetup_goals as unknown[]).length > 0
              : row.mode === "business"
                ? (Array.isArray(meta?.networking_goals) && (meta.networking_goals as unknown[]).length > 0) ||
                  (typeof meta?.networking_goals === "string" && (meta.networking_goals as string).trim().length > 0)
                : false;
        const canUse = hasPhotos && hasBio && hasGoals;
        const percent = canUse ? 100 : Math.round(([hasPhotos, hasBio, hasGoals].filter(Boolean).length / 3) * 100);

        if (row.mode === "romance") p.romance = percent;
        if (row.mode === "friends") p.friends = percent;
        if (row.mode === "business") p.business = percent;
      });

      setProgress(p);
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

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const handleModePress = (mode: ModeKey) => {
    if (loading) return;

    if (mode === "events") {
      Haptics.selectionAsync();
      setActiveModeLocal("events");
      setActiveMode("events");
      router.replace("/(modes)/events");
      return;
    }

    const percent = progress[mode];
    const canUse = percent >= 100;
    if (!canUse) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      const cfg = MODE_CONFIG[mode];
      Alert.alert(
        "Complete required fields",
        `Add main photo, bio, and goals to your ${cfg.subProfileName} sub-profile to use ${cfg.label} mode.`,
        [{ text: "OK" }, { text: "Complete now", onPress: () => router.push("/(onboarding-personal)/profile-core?edit=1") }]
      );
      return;
    }

    Haptics.selectionAsync();
    setActiveModeLocal(mode);
    setActiveMode(mode);
    router.replace(`/(modes)/${mode}` as any);
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
            return (
              <ModeCard
                key={mode}
                label={cfg.label}
                description={cfg.description}
                color={MODE_CARD_COLORS[mode]}
                icon={cfg.icon}
                iconImage={cfg.iconImage}
                active={activeMode === mode}
                onPress={() => handleModePress(mode)}
              />
            );
          })}
        </View>
      </ScrollView>

      <ModeSelectionBottomBar />
    </SafeScreenView>
  );
}

type ModeCardProps = {
  label: string;
  description: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconImage?: number;
  active: boolean;
  onPress: () => void;
};

const CARD_GAP = 12;
const CARD_ICON_SIZE = 36;
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_SIZE = (SCREEN_WIDTH - 48 - CARD_GAP * 2) / 2;
const CARD_RADIUS = 28;
const CARD_PADDING = 24;
const ACTIVE_SCALE = 1.08;

function ModeCard({ label, description, color, icon, iconImage, active, onPress }: ModeCardProps) {
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
    <View style={{ opacity: 1, transform: [{ scale: active ? ACTIVE_SCALE : 1 }], margin: CARD_GAP / 2 }}>
      <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={onPress} android_ripple={{ color: "transparent" }}>
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
