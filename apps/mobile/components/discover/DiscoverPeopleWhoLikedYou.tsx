/**
 * Section 1: People Who Liked You (Romance) / People Who Want to Connect (Friends).
 * Horizontal scroll cards; blurred for Free tier. Tap opens full profile view.
 */

import React from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";

export type PeopleWhoLikedYouItem = {
  id: string;
  name: string;
  age?: number | null;
  tag?: string | null;
  distance?: string | null;
  photoUrl?: string | null;
};

const CARD_WIDTH = 140;
const CARD_HEIGHT = 200;
const { width: SCREEN_WIDTH } = Dimensions.get("window");

type Props = {
  mode: "romance" | "friends";
  items: PeopleWhoLikedYouItem[];
  canViewFull: boolean; // Super/Premium
  primaryColor: string;
  sectionTitle: string;
  onViewProfile: (item: PeopleWhoLikedYouItem) => void;
};

export function DiscoverPeopleWhoLikedYou({
  mode,
  items,
  canViewFull,
  primaryColor,
  sectionTitle,
  onViewProfile,
}: Props) {
  const openProfile = (item: PeopleWhoLikedYouItem) => {
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
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.9}
              onPress={() => openProfile(item)}
              style={styles.card}
            >
              <View style={[styles.cardPhotoWrap, !canViewFull && styles.cardPhotoBlur]}>
                {item.photoUrl ? (
                  <Image source={{ uri: item.photoUrl }} style={styles.cardPhoto} />
                ) : (
                  <View style={[styles.cardPhoto, styles.placeholderPhoto]}>
                    <Text style={styles.placeholderEmoji}>{mode === "romance" ? "💖" : "👋"}</Text>
                  </View>
                )}
                {!canViewFull && (
                  <BlurView intensity={60} style={StyleSheet.absoluteFill} tint="light" />
                )}
                <View style={styles.likeBadge}>
                  <Text style={styles.likeBadgeText}>💖</Text>
                </View>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardName} numberOfLines={1}>
                  {item.name}
                  {item.age != null ? `, ${item.age}` : ""}
                </Text>
                {item.tag ? (
                  <Text style={[styles.cardTag, { color: primaryColor }]} numberOfLines={1}>
                    {item.tag}
                  </Text>
                ) : null}
                {item.distance ? (
                  <Text style={styles.cardDistance} numberOfLines={1}>
                    {item.distance}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

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
    height: CARD_HEIGHT * 0.55,
    backgroundColor: Colors.gray200,
    overflow: "hidden",
  },
  cardPhotoBlur: { overflow: "hidden" },
  cardPhoto: { width: "100%", height: "100%" },
  placeholderPhoto: { alignItems: "center", justifyContent: "center" },
  placeholderEmoji: { fontSize: 40 },
  cardInfo: {
    padding: 10,
    minHeight: CARD_HEIGHT * 0.45,
  },
  cardName: { ...Typography.caption, fontWeight: "600", color: Colors.textPrimary, marginBottom: 2 },
  cardTag: { ...Typography.caption, marginBottom: 2 },
  cardDistance: { ...Typography.caption, color: Colors.gray600, fontSize: 11 },
  likeBadge: { position: "absolute", top: 8, right: 8 },
  likeBadgeText: { fontSize: 16 },
});
