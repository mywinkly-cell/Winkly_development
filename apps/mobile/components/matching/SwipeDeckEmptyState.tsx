import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";

type SwipeDeckMode = "romance" | "friends";

type SwipeDeckEmptyStateProps = {
  mode: SwipeDeckMode;
  /** null while loading the likes / want-to-connect count */
  likesCount: number | null;
  onExpandRadius: () => void;
  onOpenDiscover: () => void;
};

const MODE_ACCENT: Record<SwipeDeckMode, string> = {
  romance: Colors.romance.primary,
  friends: Colors.friends.primary,
};

const MODE_SOFT_BG: Record<SwipeDeckMode, string> = {
  romance: Colors.romance.secondary,
  friends: Colors.friends.secondary,
};

function likesTeaserCopy(mode: SwipeDeckMode, count: number): string {
  const noun = count === 1 ? "person" : "people";
  if (mode === "romance") {
    return `${count} ${noun} liked you`;
  }
  return `${count} ${noun} want to connect`;
}

export function SwipeDeckEmptyState({
  mode,
  likesCount,
  onExpandRadius,
  onOpenDiscover,
}: SwipeDeckEmptyStateProps) {
  const accent = MODE_ACCENT[mode];
  const softBg = MODE_SOFT_BG[mode];

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: softBg }]}>
        <Ionicons name="location-outline" size={36} color={accent} />
      </View>

      <Text style={styles.title}>
        You&apos;ve seen everyone nearby — try expanding your distance filter
      </Text>

      <Pressable
        onPress={onExpandRadius}
        style={({ pressed }) => [
          styles.primaryBtn,
          { backgroundColor: accent },
          pressed && styles.primaryBtnPressed,
        ]}
        accessibilityLabel="Expand search radius"
      >
        <Ionicons name="resize-outline" size={20} color={Colors.white} />
        <Text style={styles.primaryBtnText}>Expand search radius</Text>
      </Pressable>

      {likesCount === null ? (
        <View style={styles.teaserLoading}>
          <ActivityIndicator size="small" color={accent} />
        </View>
      ) : likesCount > 0 ? (
        <Pressable
          onPress={onOpenDiscover}
          style={({ pressed }) => [styles.teaserCard, pressed && styles.teaserCardPressed]}
          accessibilityLabel="See who liked you in Discover"
        >
          <View style={[styles.teaserIconWrap, { backgroundColor: softBg }]}>
            <Ionicons name="heart" size={20} color={accent} />
          </View>
          <View style={styles.teaserTextWrap}>
            <Text style={styles.teaserTitle}>{likesTeaserCopy(mode, likesCount)}</Text>
            <Text style={[styles.teaserAction, { color: accent }]}>See in Discover</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.gray500} />
        </Pressable>
      ) : (
        <Pressable
          onPress={onOpenDiscover}
          style={({ pressed }) => [styles.discoverLink, pressed && styles.discoverLinkPressed]}
          accessibilityLabel="Open Discover"
        >
          <Text style={[styles.discoverLinkText, { color: accent }]}>
            Explore curated picks in Discover
          </Text>
          <Ionicons name="chevron-forward" size={18} color={accent} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Layout.spacing.xl,
    paddingVertical: Layout.spacing.lg,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Layout.spacing.lg,
  },
  title: {
    ...Typography.h3,
    fontFamily: FontFamily.heading,
    color: Colors.textPrimary,
    textAlign: "center",
    marginBottom: Layout.spacing.xl,
    maxWidth: 320,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: Layout.radii.card,
    minHeight: 48,
    minWidth: 240,
    marginBottom: Layout.spacing.xl,
  },
  primaryBtnPressed: {
    opacity: 0.88,
  },
  primaryBtnText: {
    ...Typography.button,
    fontFamily: FontFamily.heading,
    color: Colors.white,
  },
  teaserLoading: {
    minHeight: 72,
    justifyContent: "center",
  },
  teaserCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
    maxWidth: 340,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray200,
    ...Shadow.card,
    shadowOpacity: 0.06,
  },
  teaserCardPressed: {
    opacity: 0.92,
  },
  teaserIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  teaserTextWrap: {
    flex: 1,
    gap: 2,
  },
  teaserTitle: {
    ...Typography.button,
    fontFamily: FontFamily.heading,
    color: Colors.textPrimary,
  },
  teaserAction: {
    ...Typography.caption,
    fontWeight: "600",
  },
  discoverLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
  },
  discoverLinkPressed: {
    opacity: 0.75,
  },
  discoverLinkText: {
    ...Typography.caption,
    fontWeight: "600",
  },
});
