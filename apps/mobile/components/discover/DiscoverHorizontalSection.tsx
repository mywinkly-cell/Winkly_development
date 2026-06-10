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
  ScrollView,
  StyleSheet,
} from "react-native";
import { BlurView } from "expo-blur";
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";
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
  const [upgradeVisible, setUpgradeVisible] = useState(false);

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
        <Text style={[styles.sectionTitle, { color: primaryColor }]}>{title}</Text>

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
                    {blurred && <BlurView intensity={70} style={StyleSheet.absoluteFill} tint="light" />}
                    <View style={styles.nameOverlay}>
                      <Text style={styles.nameOverlayText} numberOfLines={1}>
                        {item.name}
                        {item.age != null ? `, ${item.age}` : ""}
                      </Text>
                    </View>
                    {variant === "liked_you" && (
                      <View style={styles.likeBadge}>
                        <Text style={styles.likeBadgeText}>💖</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
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

const styles = StyleSheet.create({
  section: { marginBottom: 28 },
  sectionTitle: {
    ...Typography.sectionTitle,
    fontFamily: FontFamily.headingBold,
    marginBottom: 12,
    paddingHorizontal: Layout.screenPadding,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.gray600,
    paddingHorizontal: Layout.screenPadding,
    lineHeight: 22,
  },
  scrollContent: {
    paddingHorizontal: Layout.screenPadding,
    gap: 12,
    paddingRight: Layout.screenPadding,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: Layout.radii.card,
    backgroundColor: Colors.card,
    overflow: "hidden",
  },
  cardPhotoWrap: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: Colors.gray200,
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
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  nameOverlayText: {
    ...Typography.caption,
    fontWeight: "700",
    color: Colors.white,
  },
  likeBadge: { position: "absolute", top: 8, right: 8 },
  likeBadgeText: { fontSize: 16 },
});
