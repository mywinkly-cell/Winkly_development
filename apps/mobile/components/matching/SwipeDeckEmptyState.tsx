import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { formatApproxDistance } from "@/lib/distanceUnit";
import { useAppLocaleTag } from "@/lib/i18n/appLocale";

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

function likesTeaserCopy(t: TFunction, mode: SwipeDeckMode, count: number): string {
  return mode === "romance"
    ? t("emptyStates.swipeDeck.likedYou", { count })
    : t("emptyStates.swipeDeck.wantToConnect", { count });
}

function getContextTitle(
  t: TFunction,
  localeTag: string,
  distanceKm: number | null | undefined,
  hasCustomFilters: boolean | undefined,
): string {
  if (distanceKm != null && distanceKm < 30) {
    return t("emptyStates.swipeDeck.distanceFilter", {
      distance: formatApproxDistance(distanceKm * 1000, undefined, localeTag),
    });
  }
  if (hasCustomFilters === false) {
    return t("emptyStates.swipeDeck.seenEveryoneCheckBack");
  }
  return t("emptyStates.swipeDeck.seenEveryone");
}

function seeWhoLikedLabel(t: TFunction, mode: SwipeDeckMode): string {
  return mode === "romance" ? t("emptyStates.swipeDeck.seeWhoLiked") : t("emptyStates.swipeDeck.seeWhoConnect");
}

export function SwipeDeckEmptyState({
  mode,
  likesCount,
  distanceKm,
  hasCustomFilters,
  onExpandRadius,
  onOpenDiscover,
}: SwipeDeckEmptyStateProps) {
  const { t } = useTranslation();
  const localeTag = useAppLocaleTag();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const accent = theme.modeAccent(mode).primary;
  const softBg = theme.modeAccent(mode).bg;
  const title = getContextTitle(t, localeTag, distanceKm, hasCustomFilters);
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
        <Text style={styles.likesSubtitle}>{likesTeaserCopy(t, mode, likesCount)}</Text>
      ) : null}

      {emphasizeDiscover ? (
        <Pressable
          onPress={onOpenDiscover}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: accent },
            pressed && styles.primaryBtnPressed,
          ]}
          accessibilityLabel={seeWhoLikedLabel(t, mode)}
        >
          <Ionicons name="heart" size={20} color={theme.colors.onPrimary} />
          <Text style={styles.primaryBtnText}>{seeWhoLikedLabel(t, mode)}</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={onExpandRadius}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: accent },
            pressed && styles.primaryBtnPressed,
          ]}
          accessibilityLabel={t("emptyStates.swipeDeck.expandRadius")}
        >
          <Ionicons name="resize-outline" size={20} color={theme.colors.onPrimary} />
          <Text style={styles.primaryBtnText}>{t("emptyStates.swipeDeck.expandRadius")}</Text>
        </Pressable>
      )}

      {emphasizeDiscover ? (
        <Pressable
          onPress={onExpandRadius}
          style={({ pressed }) => [styles.secondaryLink, pressed && styles.secondaryLinkPressed]}
          accessibilityLabel={t("emptyStates.swipeDeck.expandRadius")}
        >
          <Text style={[styles.secondaryLinkText, { color: accent }]}>{t("emptyStates.swipeDeck.expandRadius")}</Text>
          <Ionicons name="chevron-forward" size={18} color={accent} />
        </Pressable>
      ) : likesCount === null ? null : (
        <Pressable
          onPress={onOpenDiscover}
          style={({ pressed }) => [styles.discoverLink, pressed && styles.discoverLinkPressed]}
          accessibilityLabel={t("emptyStates.swipeDeck.openDiscover")}
        >
          <Text style={[styles.discoverLinkText, { color: accent }]}>
            {t("emptyStates.swipeDeck.explorePicks")}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={accent} />
        </Pressable>
      )}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: theme.spacing.xl,
      paddingVertical: theme.spacing.lg,
    },
    iconWrap: {
      width: 72,
      height: 72,
      borderRadius: theme.radii.pill,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.spacing.lg,
    },
    title: {
      ...theme.type.h3,
      fontFamily: theme.type.h3.fontFamily,
      color: theme.colors.textPrimary,
      textAlign: "center",
      marginBottom: theme.spacing.md,
      maxWidth: 320,
    },
    likesSubtitle: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textSecondary,
      textAlign: "center",
      marginBottom: theme.spacing.lg,
      maxWidth: 320,
    },
    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.xxl,
      borderRadius: theme.radii.lg,
      minHeight: 48,
      minWidth: 240,
      marginBottom: theme.spacing.md,
    },
    primaryBtnPressed: {
      opacity: 0.88,
    },
    primaryBtnText: {
      ...theme.type.button,
      fontFamily: theme.type.button.fontFamily,
      color: theme.colors.onPrimary,
      flexShrink: 1,
      textAlign: "center",
    },
    secondaryLink: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xxs,
      paddingVertical: theme.spacing.sm,
      marginBottom: theme.spacing.sm,
    },
    secondaryLinkPressed: {
      opacity: 0.75,
    },
    secondaryLinkText: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      fontWeight: "600",
    },
    teaserLoading: {
      minHeight: 32,
      justifyContent: "center",
      marginBottom: theme.spacing.lg,
    },
    discoverLink: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xxs,
      paddingVertical: theme.spacing.sm,
    },
    discoverLinkPressed: {
      opacity: 0.75,
    },
    discoverLinkText: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      fontWeight: "600",
    },
  });
}
