import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";

type SwipeDeckMode = "romance" | "friends";

type SwipeDeckEmptyStateProps = {
  mode: SwipeDeckMode;
  /** null while loading the likes / want-to-connect count */
  likesCount: number | null;
  /** Romance home: current distance filter (km), when known */
  distanceKm?: number | null;
  /** Romance home: false when user has never saved custom filters */
  hasCustomFilters?: boolean;
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

const FALLBACK_TITLE =
  "You've seen everyone nearby — try expanding your distance filter";

function likesTeaserCopy(mode: SwipeDeckMode, count: number): string {
  const noun = count === 1 ? "person" : "people";
  if (mode === "romance") {
    return `${count} ${noun} liked you`;
  }
  return `${count} ${noun} want to connect`;
}

function getContextTitle(
  distanceKm: number | null | undefined,
  hasCustomFilters: boolean | undefined,
): string {
  if (distanceKm != null && distanceKm < 30) {
    return `Your distance filter is set to ${distanceKm} km — try expanding it to see more people.`;
  }
  if (hasCustomFilters === false) {
    return "You've seen everyone nearby for now — new people join Winkly every day. Check back soon!";
  }
  return FALLBACK_TITLE;
}

function seeWhoLikedLabel(mode: SwipeDeckMode): string {
  return mode === "romance" ? "See who liked you" : "See who wants to connect";
}

export function SwipeDeckEmptyState({
  mode,
  likesCount,
  distanceKm,
  hasCustomFilters,
  onExpandRadius,
  onOpenDiscover,
}: SwipeDeckEmptyStateProps) {
  const accent = MODE_ACCENT[mode];
  const softBg = MODE_SOFT_BG[mode];
  const title = getContextTitle(distanceKm, hasCustomFilters);
  const emphasizeDiscover = likesCount != null && likesCount > 0;

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: softBg }]}>
        <Ionicons name="location-outline" size={36} color={accent} />
      </View>

      <Text style={styles.title}>{title}</Text>

      {likesCount === null ? (
        <View style={styles.teaserLoading}>
          <ActivityIndicator size="small" color={accent} />
        </View>
      ) : emphasizeDiscover ? (
        <Text style={styles.likesSubtitle}>{likesTeaserCopy(mode, likesCount)}</Text>
      ) : null}

      {emphasizeDiscover ? (
        <Pressable
          onPress={onOpenDiscover}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: accent },
            pressed && styles.primaryBtnPressed,
          ]}
          accessibilityLabel={seeWhoLikedLabel(mode)}
        >
          <Ionicons name="heart" size={20} color={Colors.white} />
          <Text style={styles.primaryBtnText}>{seeWhoLikedLabel(mode)}</Text>
        </Pressable>
      ) : (
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
      )}

      {emphasizeDiscover ? (
        <Pressable
          onPress={onExpandRadius}
          style={({ pressed }) => [styles.secondaryLink, pressed && styles.secondaryLinkPressed]}
          accessibilityLabel="Expand search radius"
        >
          <Text style={[styles.secondaryLinkText, { color: accent }]}>Expand search radius</Text>
          <Ionicons name="chevron-forward" size={18} color={accent} />
        </Pressable>
      ) : likesCount === null ? null : (
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
    marginBottom: Layout.spacing.md,
    maxWidth: 320,
  },
  likesSubtitle: {
    ...Typography.body,
    color: Colors.gray700,
    textAlign: "center",
    marginBottom: Layout.spacing.lg,
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
    marginBottom: Layout.spacing.md,
  },
  primaryBtnPressed: {
    opacity: 0.88,
  },
  primaryBtnText: {
    ...Typography.button,
    fontFamily: FontFamily.heading,
    color: Colors.white,
  },
  secondaryLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    marginBottom: Layout.spacing.sm,
  },
  secondaryLinkPressed: {
    opacity: 0.75,
  },
  secondaryLinkText: {
    ...Typography.caption,
    fontWeight: "600",
  },
  teaserLoading: {
    minHeight: 32,
    justifyContent: "center",
    marginBottom: Layout.spacing.lg,
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
