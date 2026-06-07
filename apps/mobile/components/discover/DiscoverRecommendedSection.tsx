/**
 * Section 2: Recommended for You by Winkly AI.
 * Vertical stacked cards (up to 5/day). Daily counter, compatibility %, shared interests.
 * Tap opens detail sheet: Send Like, View Profile, Block, Report, Close.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";
import { useFormatLocationDisplay } from "@/lib/location/useLocationDisplay";
import { DiscoverActionSheet } from "./DiscoverActionSheet";

export type RecommendedItem = {
  id: string;
  name: string;
  age?: number | null;
  location?: string | null;
  compatibility?: number | null;
  sharedInterests?: string[];
  lifestyleTag?: string | null;
  goalSnippet?: string | null;
  photoUrl?: string | null;
};

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_MARGIN_H = 20;
const CARD_WIDTH = SCREEN_WIDTH - CARD_MARGIN_H * 2;

type Props = {
  mode: "romance" | "friends";
  items: RecommendedItem[];
  remainingToday: number;
  totalPerDay: number;
  primaryColor: string;
  canLikeUnlimited: boolean;
  likesUsedToday: number;
  onSendLike: (item: RecommendedItem) => Promise<void>;
  onViewProfile: (item: RecommendedItem) => void;
  onBlock: (item: RecommendedItem) => Promise<void>;
  onReport: (item: RecommendedItem) => Promise<void>;
};

export function DiscoverRecommendedSection({
  mode,
  items,
  remainingToday,
  totalPerDay,
  primaryColor,
  canLikeUnlimited,
  likesUsedToday,
  onSendLike,
  onViewProfile,
  onBlock,
  onReport,
}: Props) {
  const fmtLoc = useFormatLocationDisplay();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [selected, setSelected] = useState<RecommendedItem | null>(null);
  const [likeLoading, setLikeLoading] = useState(false);

  const canLike = canLikeUnlimited || likesUsedToday < 1;

  const openSheet = (item: RecommendedItem) => {
    setSelected(item);
    setSheetVisible(true);
  };

  const handlePrimary = async () => {
    if (!selected) return;
    if (!canLike) return;
    setLikeLoading(true);
    try {
      await onSendLike(selected);
      setSheetVisible(false);
      setSelected(null);
    } finally {
      setLikeLoading(false);
    }
  };

  if (items.length === 0) return null;

  return (
    <>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: primaryColor }]}>
          Recommended for You by Winkly AI
        </Text>
        <Text style={styles.counter}>
          {totalPerDay} recommendations today • {remainingToday} remaining
        </Text>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.95}
              onPress={() => openSheet(item)}
              style={styles.card}
            >
              <View style={styles.cardPhotoWrap}>
                {item.photoUrl ? (
                  <Image source={{ uri: item.photoUrl }} style={styles.cardPhoto} />
                ) : (
                  <View style={[styles.cardPhoto, styles.placeholderPhoto]}>
                    <Text style={styles.placeholderEmoji}>{mode === "romance" ? "💘" : "👋"}</Text>
                  </View>
                )}
                {item.compatibility != null && (
                  <View style={[styles.compatBadge, { backgroundColor: primaryColor }]}>
                    <Text style={styles.compatText}>{item.compatibility}% match</Text>
                  </View>
                )}
              </View>

              <View style={styles.cardBody}>
                <Text style={styles.cardName}>
                  {item.name}
                  {item.age != null ? `, ${item.age}` : ""}
                </Text>
                {item.location && (
                  <Text style={styles.cardLocation}>{fmtLoc(item.location)}</Text>
                )}
                {item.sharedInterests && item.sharedInterests.length > 0 && (
                  <View style={styles.youBoth}>
                    <Text style={styles.youBothLabel}>You both:</Text>
                    {item.sharedInterests.slice(0, 3).map((s) => (
                      <Text key={s} style={styles.youBothItem}>• {s}</Text>
                    ))}
                  </View>
                )}
                {item.lifestyleTag && (
                  <View style={[styles.lifestyleChip, { backgroundColor: `${primaryColor}20` }]}>
                    <Text style={[styles.lifestyleText, { color: primaryColor }]}>{item.lifestyleTag}</Text>
                  </View>
                )}
                {item.goalSnippet && (
                  <Text style={styles.goalSnippet} numberOfLines={2}>{item.goalSnippet}</Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <DiscoverActionSheet
        visible={sheetVisible}
        mode={mode}
        variant="recommendation"
        primaryColor={primaryColor}
        primaryLoading={likeLoading}
        primaryDisabled={!canLike}
        primaryDisabledMessage={!canLike ? "1 free like per day from recommendations. Upgrade for unlimited." : undefined}
        onClose={() => { setSheetVisible(false); setSelected(null); }}
        onPrimary={handlePrimary}
        onViewProfile={() => selected && onViewProfile(selected)}
        onBlock={() => {
          if (selected) void onBlock(selected);
        }}
        onReport={() => {
          if (selected) void onReport(selected);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 24, flex: 1 },
  sectionTitle: {
    ...Typography.sectionTitle,
    fontFamily: FontFamily.headingBold,
    marginBottom: 4,
    paddingHorizontal: Layout.screenPadding,
  },
  counter: {
    ...Typography.caption,
    color: Colors.gray600,
    marginBottom: 16,
    paddingHorizontal: Layout.screenPadding,
  },
  scrollContent: { paddingHorizontal: Layout.screenPadding, paddingBottom: 24, gap: 16 },
  card: {
    width: CARD_WIDTH,
    borderRadius: Layout.radii.card,
    backgroundColor: Colors.card,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  cardPhotoWrap: {
    width: "100%",
    height: 280,
    backgroundColor: Colors.gray200,
    overflow: "hidden",
  },
  cardPhoto: { width: "100%", height: "100%" },
  placeholderPhoto: { alignItems: "center", justifyContent: "center" },
  placeholderEmoji: { fontSize: 48 },
  compatBadge: {
    position: "absolute",
    bottom: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  compatText: { ...Typography.caption, fontWeight: "700", color: Colors.white },
  cardBody: { padding: 16 },
  cardName: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 4 },
  cardLocation: { ...Typography.caption, color: Colors.gray600, marginBottom: 8 },
  youBoth: { marginBottom: 8 },
  youBothLabel: { ...Typography.caption, fontWeight: "600", color: Colors.textPrimary, marginBottom: 4 },
  youBothItem: { ...Typography.caption, color: Colors.gray700, marginLeft: 4 },
  lifestyleChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 6,
  },
  lifestyleText: { ...Typography.caption, fontWeight: "600" },
  goalSnippet: { ...Typography.body, color: Colors.gray700, fontSize: 14 },
});
