// ────────────────────────────────────────────────
// Winkly Settings — v8 Global Account & App Preferences
// Mode Selection → Settings icon (single access point)
// Account-level configuration only; sub-profiles managed via Profile
// ────────────────────────────────────────────────

import React from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";

type SectionItem = {
  title: string;
  subtitle?: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
};

type Section = {
  title: string;
  items: SectionItem[];
};

const SECTIONS: Section[] = [
  {
    title: "Account & Identity",
    items: [
      { title: "Account & Identity", subtitle: "Email, password, account type, delete account", route: "/account/account-identity", icon: "person-outline" },
    ],
  },
  {
    title: "Privacy & Safety",
    items: [
      { title: "Privacy & Safety", subtitle: "Visibility, discovery, location, blocked users", route: "/account/privacy-safety", icon: "shield-checkmark-outline" },
    ],
  },
  {
    title: "Notifications & Preferences",
    items: [
      { title: "Notifications & Preferences", subtitle: "Push, email, sound, language", route: "/account/notifications-preferences", icon: "notifications-outline" },
      { title: "Calendar & Maps", subtitle: "Sync planner, location access", route: "/planner/settings", icon: "calendar-outline", iconColor: Colors.events.primary },
    ],
  },
  {
    title: "Payments & Subscriptions",
    items: [
      { title: "Subscription plans", subtitle: "Super & Premium tariffs", route: "/account/subscription", icon: "card-outline" },
      { title: "Payment methods", subtitle: "Billing history and payment methods", route: "/account/payments", icon: "wallet-outline" },
    ],
  },
  {
    title: "Support & Legal",
    items: [
      { title: "Legal", subtitle: "Terms, privacy, community guidelines", route: "/account/legal", icon: "document-text-outline" },
      { title: "Invite", subtitle: "Invite contacts to Winkly", route: "/account/invite", icon: "people-outline" },
    ],
  },
  {
    title: "App Info & Logout",
    items: [
      { title: "App Info & Logout", subtitle: "Version, what's new, sign out", route: "/account/app-info", icon: "information-circle-outline" },
    ],
  },
];

function SectionCard({ title, items }: Section) {
  const router = useRouter();

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>
        {items.map((item, idx) => (
          <TouchableOpacity
            key={item.route}
            onPress={() => {
              Haptics.selectionAsync();
              router.push(item.route as any);
            }}
            style={[styles.row, idx < items.length - 1 && styles.rowBorder]}
            activeOpacity={0.7}
            accessibilityLabel={item.title}
            accessibilityHint={item.subtitle}
          >
            <View style={[styles.iconWrap, item.iconColor && { backgroundColor: item.iconColor + "20" }]}>
              <Ionicons
                name={item.icon}
                size={22}
                color={item.iconColor ?? Colors.primaryViolet}
              />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              {item.subtitle && (
                <Text style={styles.rowSubtitle} numberOfLines={1}>{item.subtitle}</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function SettingsIndex() {
  const router = useRouter();
  return (
    <SafeScreenView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            router.back();
          }}
          style={styles.backBtn}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {SECTIONS.map((section) => (
          <SectionCard key={section.title} {...section} />
        ))}
      </ScrollView>
    </SafeScreenView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.backgroundMuted,
  },
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
  placeholder: { width: 44 },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Layout.screenPadding,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.gray600,
    marginBottom: 8,
    marginLeft: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    overflow: "hidden",
    ...Shadow.card,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: Layout.touchTargetMin,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primaryViolet + "15",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  rowSubtitle: {
    ...Typography.caption,
    color: Colors.gray600,
    marginTop: 2,
  },
});
