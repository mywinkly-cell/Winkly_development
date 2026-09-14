/**
 * Discover category row — horizontal scroll of profile cards with name + age on photo.
 * Supports per-index blur for Free tier (Liked you / Recommended).
 */

import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { BlurView } from "expo-blur";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { DISCOVER_LIMITS } from "@/lib/discover/storage";
import type { DiscoverProfileItem } from "@/lib/discover/types";
import { DiscoverUpgradeModal } from "./DiscoverUpgradeModal";

export type DiscoverSectionVariant = "liked_you" | "recommended" | "category";

type Props = {
  mode: "romance" | "friends";
  title: string;
  items: DiscoverProfileItem[];
  primaryColor: string;
  variant: DiscoverSectionVariant;
  canViewFull: boolean;
  emptyMessage?: string;
  onViewProfile: (item: DiscoverProfileItem) => void;
};

const CARD_WIDTH = 148;
const CARD_HEIGHT = 196;
const EMPTY_MESSAGE =
  "Unfortunately at the moment there are no people in this category. Check later.";

function isBlurred(index: number, variant: DiscoverSectionVariant, canViewFull: boolean): boolean {
  if (canViewFull) return false;
  if (variant !== "liked_you" && variant !== "recommended") return false;
  return index >= DISCOVER_LIMITS.freeVisibleBeforeBlur;
}

export function DiscoverHorizontalSection({
  mode,
  title,
  items,
  primaryColor,
  variant,
  canViewFull,
  emptyMessage = EMPTY_MESSAGE,
  onViewProfile,
}: Props) {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const [upgradeVisible, setUpgradeVisible] = useState(false);

  const blurredCount = items.filter((_, index) => isBlurred(index, variant, canViewFull)).length;
  const showLikedYouUpgradeBanner =
    variant === "liked_you" && !canViewFull && blurredCount > 0;

  const openCard = (item: DiscoverProfileItem, index: number) => {
    if (isBlurred(index, variant, canViewFull)) {
      setUpgradeVisible(true);
      return;
    }
    onViewProfile(item);
  };

  return (
    <>
      <View style={styles.section}>
        <Text style={{ ...styles.sectionTitle, color: primaryColor }}>{title}</Text>

        {items.length === 0 ? (
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {items.map((item, index) => {
              const blurred = isBlurred(index, variant, canViewFull);
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.9}
                  onPress={() => openCard(item, index)}
                  style={styles.card}
                  accessibilityRole="button"
                  accessibilityLabel={
                    blurred
                      ? `Upgrade to see ${item.name}${item.age != null ? `, age ${item.age}` : ""}`
                      : `View profile, ${item.name}${item.age != null ? `, age ${item.age}` : ""}`
                  }
                >
                  <View style={styles.cardPhotoWrap}>
                    {item.photoUrl ? (
                      <Image source={{ uri: item.photoUrl }} style={styles.cardPhoto} />
                    ) : (
                      <View style={[styles.cardPhoto, styles.placeholderPhoto]}>
                        <Text style={styles.placeholderEmoji}>{mode === "romance" ? "💖" : "👋"}</Text>
                      </View>
                    )}
                    <View style={styles.nameOverlay} pointerEvents="none">
                      <Text style={styles.nameOverlayText} numberOfLines={1}>
                        {item.name}
                        {item.age != null ? `, ${item.age}` : ""}
                      </Text>
                    </View>
                    {variant === "liked_you" && (
                      <View style={styles.likeBadge} pointerEvents="none">
                        <Text style={styles.likeBadgeText}>💖</Text>
                      </View>
                    )}
                    {blurred ? (
                      <BlurView intensity={70} style={StyleSheet.absoluteFill} tint="light" />
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}

            {showLikedYouUpgradeBanner ? (
              <Pressable
                onPress={() => setUpgradeVisible(true)}
                style={[
                  styles.card,
                  styles.upgradeBanner,
                  {
                    backgroundColor: theme.modeAccent(mode).bg,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Unlock to see ${blurredCount} more profiles`}
              >
                <Text style={{ ...styles.upgradeBannerText, color: primaryColor }}>
                  +{blurredCount} more — Unlock to see
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>
        )}
      </View>

      <DiscoverUpgradeModal
        visible={upgradeVisible}
        primaryColor={primaryColor}
        onClose={() => setUpgradeVisible(false)}
      />
    </>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    section: { marginBottom: theme.spacing.xxl },
    sectionTitle: {
      ...theme.type.h3,
      fontFamily: theme.type.h3.fontFamily,
      marginBottom: theme.spacing.md,
      paddingHorizontal: theme.spacing.xl,
    },
    emptyText: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textSecondary,
      paddingHorizontal: theme.spacing.xl,
    },
    scrollContent: {
      paddingHorizontal: theme.spacing.xl,
      gap: theme.spacing.md,
      paddingRight: theme.spacing.xl,
    },
    card: {
      width: CARD_WIDTH,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
      overflow: "hidden",
    },
    cardPhotoWrap: {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      backgroundColor: theme.colors.border,
      overflow: "hidden",
    },
    cardPhoto: { width: "100%", height: "100%" },
    placeholderPhoto: { alignItems: "center", justifyContent: "center" },
    placeholderEmoji: { fontSize: 40 },
    nameOverlay: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
      backgroundColor: "rgba(0,0,0,0.45)",
    },
    nameOverlayText: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      fontWeight: "700",
      color: "#FFFFFF",
    },
    likeBadge: { position: "absolute", top: 8, right: 8 },
    likeBadgeText: { fontSize: 16 },
    upgradeBanner: {
      height: CARD_HEIGHT,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: theme.spacing.md,
    },
    upgradeBannerText: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      fontWeight: "700",
      textAlign: "center",
    },
  });
}
