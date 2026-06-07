import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { Avatar } from "@/components/ui/Avatar";

type Props = {
  myPhotoUrl?: string | null;
  myInitials: string;
  partnerPhotoUrl?: string | null;
  partnerInitials: string;
  sharedInterestCount: number;
  distanceLabel?: string | null;
};

export function MatchContextBar({
  myPhotoUrl,
  myInitials,
  partnerPhotoUrl,
  partnerInitials,
  sharedInterestCount,
  distanceLabel,
}: Props) {
  const parts = ["It's a match!"];
  if (sharedInterestCount > 0) {
    parts.push(
      `${sharedInterestCount} shared interest${sharedInterestCount === 1 ? "" : "s"}`
    );
  }
  if (distanceLabel) parts.push(distanceLabel);

  return (
    <View style={styles.wrap}>
      <View style={styles.avatarRow}>
        <View style={styles.avatarOverlap}>
          <Avatar uri={myPhotoUrl} initials={myInitials} size={36} />
          <View style={styles.partnerAvatar}>
            <Avatar uri={partnerPhotoUrl} initials={partnerInitials} size={36} />
          </View>
        </View>
        <Text style={styles.summary} numberOfLines={2}>
          {parts.join(" · ")}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 14,
    marginTop: 8,
    marginBottom: 4,
    padding: 12,
    borderRadius: Layout.radii.control,
    backgroundColor: Colors.romance.primary + "12",
    borderWidth: 1,
    borderColor: Colors.romance.primary + "33",
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarOverlap: {
    flexDirection: "row",
    alignItems: "center",
  },
  partnerAvatar: {
    marginLeft: -14,
    borderWidth: 2,
    borderColor: Colors.white,
    borderRadius: 20,
  },
  summary: {
    flex: 1,
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.textPrimary,
    lineHeight: 18,
  },
});
