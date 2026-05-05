/**
 * Compact event card for Events home strips (Winkly or external).
 * Shows image, title, time, location, host; supports "Add to planner" and external link.
 */

import React from "react";
import { View, Text, TouchableOpacity, Image, Linking, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { useFormatLocationDisplay } from "@/lib/location/useLocationDisplay";

export type EventCardItem = {
  id: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  startAt: string; // ISO
  endAt?: string | null;
  location?: string | null;
  venueName?: string | null;
  hostName?: string | null;
  /** If set, event is from external platform; tap card opens link. */
  externalUrl?: string | null;
  externalPlatform?: "meetup" | "eventbrite" | null;
  category?: string | null;
  /** Winkly event id for navigation to event details */
  winklyEventId?: string | null;
};

type Props = {
  item: EventCardItem;
  onAddToPlanner?: (item: EventCardItem) => void;
  onPress?: (item: EventCardItem) => void;
  compact?: boolean;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function EventCard({ item, onAddToPlanner, onPress, compact }: Props) {
  const fmtLoc = useFormatLocationDisplay();
  const handlePress = () => {
    if (item.externalUrl) {
      Linking.openURL(item.externalUrl);
    } else {
      onPress?.(item);
    }
  };

  const loc = item.location ? fmtLoc(item.location) : "";
  const locationLine = [item.venueName, loc].filter(Boolean).join(" • ") || loc;

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.85}
      style={[styles.card, compact && styles.cardCompact]}
    >
      <View style={styles.imageWrap}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="calendar" size={32} color={Colors.gray400} />
          </View>
        )}
        {item.externalPlatform && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>From {item.externalPlatform === "meetup" ? "Meetup" : "Eventbrite"}</Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.time}>{formatDate(item.startAt)}</Text>
        {locationLine ? <Text style={styles.location} numberOfLines={1}>{locationLine}</Text> : null}
        {item.hostName ? <Text style={styles.host} numberOfLines={1}>{item.hostName}</Text> : null}
        {onAddToPlanner && (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onAddToPlanner(item);
            }}
            style={styles.addBtn}
          >
            <Ionicons name="add-circle-outline" size={18} color={Colors.primaryViolet} />
            <Text style={styles.addBtnText}>Add to planner</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

const CARD_WIDTH = 200;
const CARD_COMPACT_WIDTH = 160;

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: "#FFF",
    borderRadius: Layout.radii.card,
    overflow: "hidden",
    marginRight: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  cardCompact: {
    width: CARD_COMPACT_WIDTH,
  },
  imageWrap: {
    width: "100%",
    height: 100,
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: { fontSize: 10, color: "#FFF" },
  body: { padding: 10 },
  title: { ...Typography.body, fontWeight: "600", color: Colors.textPrimary, marginBottom: 4 },
  time: { ...Typography.caption, color: Colors.gray600, marginBottom: 2 },
  location: { ...Typography.caption, color: Colors.gray500, marginBottom: 2 },
  host: { ...Typography.caption, color: Colors.gray500, marginBottom: 6 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  addBtnText: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "600" },
});

export const EVENT_CARD_WIDTH = CARD_WIDTH;
export const EVENT_CARD_COMPACT_WIDTH = CARD_COMPACT_WIDTH;
