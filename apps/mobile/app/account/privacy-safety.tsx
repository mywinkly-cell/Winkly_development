// ────────────────────────────────────────────────
// Winkly — Privacy & Safety (Settings v8)
// Visibility, discovery, location, blocked users (blacklist)
// ────────────────────────────────────────────────

import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";

export default function PrivacySafety() {
  const router = useRouter();

  const Row = ({
    title,
    subtitle,
    onPress,
    icon,
  }: {
    title: string;
    subtitle?: string;
    onPress: () => void;
    icon: keyof typeof Ionicons.glyphMap;
  }) => (
    <TouchableOpacity
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={styles.row}
      activeOpacity={0.7}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={20} color={Colors.primaryViolet} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
    </TouchableOpacity>
  );

  return (
    <SafeScreenView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy & Safety</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Discovery & visibility</Text>
          <Row
            title="Profile visibility"
            subtitle="Control who can see and discover you"
            onPress={() => {}}
            icon="eye-outline"
          />
          <View style={styles.divider} />
          <Row
            title="Recommendation preferences"
            subtitle="Adjust how you appear in feeds"
            onPress={() => {}}
            icon="options-outline"
          />
          <View style={styles.divider} />
          <Row
            title="Location & radius"
            subtitle="City suggestions, discovery distance, recommendations"
            onPress={() => router.push("/planner/settings")}
            icon="location-outline"
          />
          <View style={styles.divider} />
          <Row
            title="Data sharing permissions"
            subtitle="What we share with partners"
            onPress={() => {}}
            icon="share-social-outline"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Blocked users</Text>
          <Text style={styles.hint}>
            Manage your block list. Unblocking does not notify the user. Previously blocked profiles do not automatically reappear in recommendations.
          </Text>
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/account/blocked-users");
            }}
            style={styles.primaryRow}
            activeOpacity={0.7}
          >
            <Ionicons name="ban-outline" size={22} color={Colors.primaryViolet} />
            <Text style={styles.primaryRowText}>View blocked users</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeScreenView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundMuted },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    ...Layout.topHeaderBar,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  headerTitle: { ...Typography.h3, fontFamily: FontFamily.heading, color: Colors.textPrimary },
  placeholder: { width: 40 },
  scroll: { padding: Layout.screenPadding, paddingBottom: 40 },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: {
    ...Typography.h3,
    fontFamily: FontFamily.heading,
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primaryViolet + "15",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  rowContent: { flex: 1 },
  rowTitle: { ...Typography.body, fontWeight: "600", color: Colors.textPrimary },
  rowSubtitle: { ...Typography.caption, color: Colors.gray600, marginTop: 2 },
  divider: { height: 1, backgroundColor: Colors.gray200, marginLeft: 50 },
  hint: {
    ...Typography.caption,
    color: Colors.gray600,
    lineHeight: 20,
    marginBottom: 14,
  },
  primaryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  primaryRowText: { ...Typography.body, fontWeight: "600", color: Colors.primaryViolet, marginLeft: 12 },
});
