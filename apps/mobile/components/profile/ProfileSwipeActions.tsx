import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/tokens";

const ACTION_BUTTON_SIZE = 64;
const ACTION_ICON_SIZE = 35;

export type ProfileSwipeMode = "romance" | "friends" | "business";

type Props = {
  mode: ProfileSwipeMode;
  primaryColor: string;
  disabled?: boolean;
  superDisabled?: boolean;
  onPass: () => void;
  onSuper: () => void;
  onLike: () => void;
};

export function ProfileSwipeActions({
  mode,
  primaryColor,
  disabled = false,
  superDisabled = false,
  onPass,
  onSuper,
  onLike,
}: Props) {
  const likeIcon = mode === "business" ? "person-add-outline" : "heart";
  const superIcon = "star";

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Pressable
          onPress={onPass}
          disabled={disabled}
          style={({ pressed }) => [
            styles.iconWrap,
            styles.glowPass,
            { shadowColor: primaryColor },
            disabled && styles.disabled,
            pressed && styles.pressed,
          ]}
          accessibilityLabel="Pass"
        >
          <Ionicons name="close" size={ACTION_ICON_SIZE} color={primaryColor} />
        </Pressable>

        <Pressable
          onPress={onSuper}
          disabled={disabled || superDisabled}
          style={({ pressed }) => [
            styles.iconWrap,
            styles.glowSuper,
            (disabled || superDisabled) && styles.disabled,
            pressed && styles.pressed,
          ]}
          accessibilityLabel={mode === "friends" ? "Super Connect" : mode === "romance" ? "Super Like" : "Connect"}
        >
          <Ionicons name={superIcon} size={ACTION_ICON_SIZE} color="#E6B800" />
        </Pressable>

        <Pressable
          onPress={onLike}
          disabled={disabled}
          style={({ pressed }) => [
            styles.iconWrap,
            styles.glowLike,
            { shadowColor: primaryColor },
            disabled && styles.disabled,
            pressed && styles.pressed,
          ]}
          accessibilityLabel={mode === "friends" ? "Add friend" : mode === "romance" ? "Like" : "Connect"}
        >
          <Ionicons name={likeIcon} size={ACTION_ICON_SIZE} color={primaryColor} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 28,
  },
  row: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  iconWrap: {
    width: ACTION_BUTTON_SIZE,
    height: ACTION_BUTTON_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  glowPass: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.38,
    shadowRadius: 12,
    elevation: 4,
  },
  glowSuper: {
    shadowColor: "#E6B800",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.42,
    shadowRadius: 12,
    elevation: 4,
  },
  glowLike: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.38,
    shadowRadius: 12,
    elevation: 4,
  },
  disabled: { opacity: 0.5 },
  pressed: { transform: [{ scale: 0.92 }] },
});
