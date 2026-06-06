// ────────────────────────────────────────────────
// Mode Switch Center Button — In-bar circle for mode selection
// Same premium 3D as mode cards: neutral depth shadow + subtle highlight border
// ────────────────────────────────────────────────

import React from "react";
import { View, Pressable, StyleSheet, Image } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Routes } from "@/constants/routes";
import { Colors } from "@/constants/tokens";

const EVENTS_ICON = require("@/assets/icons/events-icon_1.png");

const TAB_HEIGHT = 48;
const SCALE = 0.855; // 10% then 5% smaller
const RADIUS = TAB_HEIGHT * 1.05 * SCALE;
const SIZE = RADIUS * 2;
// Mode selection cards use 36; button icon should be 90% of that.
const CARD_ICON_SIZE = 36;
const ICON_SIZE = Math.round(CARD_ICON_SIZE * 0.9);

export type ModeKey = "romance" | "friends" | "business" | "events";

const MODE_ICON: Record<ModeKey, keyof typeof Ionicons.glyphMap | null> = {
  romance: "heart",
  friends: "people",
  business: "briefcase",
  events: null, // uses custom image
};

type ModeSwitchCenterButtonProps = {
  mode: ModeKey;
};

export function ModeSwitchCenterButton({ mode }: ModeSwitchCenterButtonProps) {
  const router = useRouter();
  const primary = Colors[mode].primary;

  const onPress = () => {
    Haptics.selectionAsync();
    router.replace(Routes.modeSelection);
  };

  // Same premium 3D as mode cards: neutral depth shadow (visible on all modes)
  const depthShadow = {
    shadowColor: Colors.softBlack,
    shadowOffset: { width: 0, height: 4 } as const,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 10,
  };

  return (
    <View style={styles.slot} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        style={[
          styles.circle,
          { backgroundColor: primary, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
          depthShadow,
        ]}
        accessibilityLabel="Switch mode"
      >
        {mode === "events" ? (
          <Image source={EVENTS_ICON} style={{ width: ICON_SIZE, height: ICON_SIZE, tintColor: Colors.white }} resizeMode="contain" />
        ) : (
          <Ionicons name={MODE_ICON[mode] as keyof typeof Ionicons.glyphMap} size={ICON_SIZE} color={Colors.white} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    width: SIZE,
    height: TAB_HEIGHT,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  circle: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: RADIUS,
    alignItems: "center",
    justifyContent: "center",
  },
});
