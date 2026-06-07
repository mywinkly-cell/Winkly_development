import React from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { buildStorageImageUrl } from "@/lib/images/cdnImage";
import type { BusinessPersonItem } from "@/lib/business/homeFeed";

type Props = {
  person: BusinessPersonItem;
  industry?: string | null;
  onPress: () => void;
};

/** LinkedIn-style list card for Business Discover (logo, role, company, industry chip). */
export function BusinessDiscoverListCard({ person, industry, onPress }: Props) {
  const photoUri = person.photoUrl
    ? buildStorageImageUrl(person.photoUrl, { width: 96, quality: 80, resize: "cover" })
    : null;
  const industryLabel = industry?.trim() || person.intentGoal?.trim() || person.tags[0]?.trim() || null;
  const roleCompany = person.subtitle?.split(" · ").filter(Boolean) ?? [];
  const jobTitle = roleCompany[0] ?? null;
  const companyName = roleCompany[1] ?? roleCompany[0] ?? null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.92 : 1 }]}
    >
      <View style={styles.row}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.logo} />
        ) : (
          <View style={[styles.logo, styles.logoPlaceholder]}>
            <Text style={styles.logoInitial}>{person.name.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.main}>
          {jobTitle ? (
            <Text style={styles.jobTitle} numberOfLines={1}>
              {jobTitle}
            </Text>
          ) : null}
          {companyName && companyName !== jobTitle ? (
            <Text style={styles.company} numberOfLines={1}>
              {companyName}
            </Text>
          ) : (
            <Text style={styles.company} numberOfLines={1}>
              {person.name}
            </Text>
          )}
          {industryLabel ? (
            <View style={styles.industryChip}>
              <Text style={styles.industryText} numberOfLines={1}>
                {industryLabel}
              </Text>
            </View>
          ) : null}
          {(person.mutualCount ?? 0) > 0 ? (
            <Text style={styles.mutual}>
              {person.mutualCount} mutual connection{(person.mutualCount ?? 0) === 1 ? "" : "s"}
            </Text>
          ) : null}
          {person.meta ? (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={12} color={Colors.gray500} />
              <Text style={styles.location} numberOfLines={1}>
                {person.meta}
              </Text>
            </View>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: Colors.gray100,
  },
  logoPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.business.secondary,
  },
  logoInitial: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.business.primary,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  jobTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.textPrimary,
  },
  company: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.gray700,
    marginTop: 2,
  },
  industryChip: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Colors.business.secondary,
    maxWidth: "100%",
  },
  industryText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.business.primary,
  },
  mutual: {
    ...Typography.caption,
    color: Colors.business.primary,
    fontWeight: "600",
    marginTop: 6,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  location: {
    fontSize: 12,
    color: Colors.gray500,
    flex: 1,
  },
});
