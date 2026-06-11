import React from "react";
import { View, Text, Image, Pressable, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { buildStorageImageUrl } from "@/lib/images/cdnImage";
import type { BusinessPersonItem } from "@/lib/business/homeFeed";

const SCREEN_WIDTH = Dimensions.get("window").width;
const GRID_GAP = 12;
const CARD_WIDTH = (SCREEN_WIDTH - 40 - GRID_GAP) / 2;
const PHOTO_WIDTH = CARD_WIDTH - 16;

type Props = {
  person: BusinessPersonItem;
  onPress: () => void;
  showConnect?: boolean;
  onConnect?: () => void;
  columnWidth?: number;
};

export function BusinessProfileCard({
  person,
  onPress,
  showConnect = false,
  onConnect,
  columnWidth = CARD_WIDTH,
}: Props) {
  const photoUri = person.photoUrl
    ? buildStorageImageUrl(person.photoUrl, { width: Math.round(PHOTO_WIDTH), quality: 80, resize: "cover" })
    : null;
  const intent = person.intentGoal?.slice(0, 16);
  const highlightSet = new Set((person.highlightTags ?? []).map((t) => t.trim().toLowerCase()));
  // Show up to 3 tags, shared-with-viewer first so common interests surface and highlight.
  const sortedTags = [...(person.tags ?? [])].sort((a, b) => {
    const sa = highlightSet.has(a.trim().toLowerCase()) ? 0 : 1;
    const sb = highlightSet.has(b.trim().toLowerCase()) ? 0 : 1;
    return sa - sb;
  });
  const topTags = sortedTags.slice(0, 3);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width: columnWidth, opacity: pressed ? 0.92 : 1 },
      ]}
    >
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.photo} />
      ) : (
        <View style={[styles.photo, styles.photoPlaceholder]}>
          <Text style={styles.initials}>{person.name.slice(0, 1).toUpperCase()}</Text>
        </View>
      )}
      <Text style={styles.name} numberOfLines={1}>
        {person.name}
      </Text>
      {person.subtitle ? (
        <Text style={styles.roleLine} numberOfLines={1}>
          {person.subtitle}
        </Text>
      ) : null}
      {person.meta ? (
        <View style={styles.cityRow}>
          <Ionicons name="location-outline" size={11} color={Colors.gray500} />
          <Text style={styles.city} numberOfLines={1}>
            {person.meta}
          </Text>
        </View>
      ) : null}
      {intent ? (
        <View style={styles.intentChip}>
          <Text style={styles.intentText} numberOfLines={1}>
            {intent}
          </Text>
        </View>
      ) : null}
      {topTags.length > 0 ? (
        <View style={styles.tagRow}>
          {topTags.map((t) => {
            const shared = highlightSet.has(t.trim().toLowerCase());
            return (
              <View key={t} style={[styles.tagChip, shared && styles.tagChipShared]}>
                <Text
                  style={[styles.tagText, shared && styles.tagTextShared]}
                  numberOfLines={1}
                >
                  {t}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
      {(person.mutualCount ?? 0) > 0 ? (
        <Text style={styles.mutual}>{person.mutualCount} mutual</Text>
      ) : null}
      {showConnect && onConnect ? (
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onConnect();
          }}
          style={styles.connectBtn}
        >
          <Text style={styles.connectText}>Connect</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    padding: 8,
    marginBottom: GRID_GAP,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  photo: {
    width: "100%",
    height: Math.round(PHOTO_WIDTH * 0.85),
    borderRadius: Layout.radii.control,
    marginBottom: 8,
    backgroundColor: Colors.gray100,
  },
  photoPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.business.secondary,
  },
  initials: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.business.primary,
  },
  name: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  roleLine: {
    fontSize: 11,
    color: Colors.gray600,
    marginTop: 2,
  },
  cityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 2,
  },
  city: {
    fontSize: 11,
    color: Colors.gray500,
    flex: 1,
  },
  intentChip: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Colors.business.secondary,
    maxWidth: "100%",
  },
  intentText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.business.primary,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 6,
  },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
    maxWidth: "100%",
  },
  tagChipShared: {
    backgroundColor: Colors.business.primary,
    borderColor: Colors.business.primary,
  },
  tagText: {
    fontSize: 10,
    color: Colors.gray600,
  },
  tagTextShared: {
    color: Colors.white,
    fontWeight: "700",
  },
  mutual: {
    fontSize: 10,
    color: Colors.gray500,
    marginTop: 4,
  },
  connectBtn: {
    marginTop: 8,
    backgroundColor: Colors.business.primary,
    borderRadius: Layout.radii.control,
    paddingVertical: 8,
    alignItems: "center",
  },
  connectText: {
    ...Typography.caption,
    color: Colors.white,
    fontWeight: "700",
  },
});
