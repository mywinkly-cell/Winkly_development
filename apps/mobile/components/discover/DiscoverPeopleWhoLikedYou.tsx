/**
 * Section 1: People Who Liked You (Romance) / People Who Want to Connect (Friends).
 * Horizontal scroll cards; per-index blur for Free tier (matches DiscoverHorizontalSection).
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
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";
import { DISCOVER_LIMITS } from "@/lib/discover/storage";
import { DiscoverUpgradeModal } from "./DiscoverUpgradeModal";

export type PeopleWhoLikedYouItem = {
  id: string;
  name: string;
  age?: number | null;
  tag?: string | null;
  distance?: string | null;
  photoUrl?: string | null;
};

const CARD_WIDTH = 148;
const CARD_HEIGHT = 196;

type Props = {
  mode: "romance" | "friends";
  items: PeopleWhoLikedYouItem[];
  canViewFull: boolean;
  primaryColor: string;
  sectionTitle: string;
  onViewProfile: (item: PeopleWhoLikedYouItem) => void;
};

function isBlurred(index: number, canViewFull: boolean): boolean {
  if (canViewFull) return false;
  return index >= DISCOVER_LIMITS.freeVisibleBeforeBlur;
}

export function DiscoverPeopleWhoLikedYou({
  mode,
  items,
  canViewFull,
  primaryColor,
  sectionTitle,
  onViewProfile,
}: Props) {
  const [upgradeVisible, setUpgradeVisible] = useState(false);

  const blurredCount = items.filter((_, index) => isBlurred(index, canViewFull)).length;

  const openProfile = (item: PeopleWhoLikedYouItem, index: number) => {
    if (isBlurred(index, canViewFull)) {
      setUpgradeVisible(true);
      return;
    }
    onViewProfile(item);
  };

  if (items.length === 0) return null;

  return (
    <>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: primaryColor }]}>{sectionTitle}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {items.map((item, index) => {
            const blurred = isBlurred(index, canViewFull);
            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.9}
                onPress={() => openProfile(item, index)}
                style={styles.card}
                accessibilityRole="button"
                accessibilityLabel={
                  blurred
                    ? `Upgrade to see ${item.name}${item.age != null ? `, age ${item.age}` : ""}. Liked you`
                    : `View profile, ${item.name}${item.age != null ? `, age ${item.age}` : ""}. Liked you`
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
                    {!blurred && item.tag ? (
                      <Text style={[styles.overlayMeta, { color: Colors.white }]} numberOfLines={1}>
                        {item.tag}
                      </Text>
                    ) : null}
                    {!blurred && item.distance ? (
                      <Text style={styles.overlayMeta} numberOfLines={1}>
                        {item.distance}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.likeBadge} pointerEvents="none">
                    <Text style={styles.likeBadgeText}>💖</Text>
                  </View>
                  {blurred ? (
                    <BlurView intensity={70} style={StyleSheet.absoluteFill} tint="light" />
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}

          {!canViewFull && blurredCount > 0 ? (
            <Pressable
              onPress={() => setUpgradeVisible(true)}
              style={[
                styles.card,
                styles.upgradeBanner,
                {
                  backgroundColor:
                    mode === "romance" ? Colors.romance.secondary : Colors.friends.secondary,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Unlock to see ${blurredCount} more profiles`}
            >
              <Text style={[styles.upgradeBannerText, { color: primaryColor }]}>
                +{blurredCount} more — Unlock to see
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
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
  section: { marginBottom: 24 },
  sectionTitle: {
    ...Typography.sectionTitle,
    fontFamily: FontFamily.headingBold,
    marginBottom: 12,
    paddingHorizontal: Layout.screenPadding,
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
  overlayMeta: {
    ...Typography.caption,
    fontSize: 11,
    color: "rgba(255,255,255,0.85)",
    marginTop: 2,
  },
  likeBadge: { position: "absolute", top: 8, right: 8 },
  likeBadgeText: { fontSize: 16 },
  upgradeBanner: {
    height: CARD_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  upgradeBannerText: {
    ...Typography.caption,
    fontFamily: FontFamily.headingBold,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 18,
  },
});
