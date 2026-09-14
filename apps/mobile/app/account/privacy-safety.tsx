// ────────────────────────────────────────────────
// Winkly — Privacy & Safety (Settings v8)
// Visibility, discovery, location, blocked users (blacklist)
// ────────────────────────────────────────────────

import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Card, Header, ListRow } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

export default function PrivacySafety() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  const Row = ({
    title,
    subtitle,
    onPress,
    icon,
    last,
  }: {
    title: string;
    subtitle?: string;
    onPress: () => void;
    icon: keyof typeof Ionicons.glyphMap;
    last?: boolean;
  }) => (
    <ListRow
      title={title}
      subtitle={subtitle}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={last ? styles.row : { ...styles.row, ...styles.rowBorder }}
      leading={
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={20} color={theme.colors.primary} />
        </View>
      }
    />
  );

  return (
    <SafeScreenView style={styles.screen}>
      <Header title="Privacy & Safety" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Discovery & visibility</Text>
        <Card padding="none" style={styles.card}>
          <Row title="Profile visibility" subtitle="Control who can see and discover you" onPress={() => {}} icon="eye-outline" />
          <Row title="Recommendation preferences" subtitle="Adjust how you appear in feeds" onPress={() => {}} icon="options-outline" />
          <Row title="Location & radius" subtitle="City suggestions, discovery distance, recommendations" onPress={() => router.push("/planner/settings")} icon="location-outline" />
          <Row title="Location precision" subtitle="Exact or approximate — your raw GPS is never stored" onPress={() => router.push("/account/location-privacy" as never)} icon="navigate-outline" />
          <Row title="Photo verification" subtitle="Selfie check against your profile photo" onPress={() => router.push("/account/photo-verification" as never)} icon="camera-outline" />
          <Row title="Data sharing permissions" subtitle="What we share with partners" onPress={() => router.push("/account/ai-memory")} icon="share-social-outline" last />
        </Card>

        <Text style={styles.sectionTitle}>AI & data controls</Text>
        <Card padding="none" style={styles.card}>
          <Row title="Delete AI memory" subtitle="Clear your vector profile, cached AI plans, and AI usage records" onPress={() => router.push("/account/ai-memory")} icon="trash-outline" last />
        </Card>

        <Text style={styles.sectionTitle}>Blocked users</Text>
        <Card style={styles.card}>
          <Text style={styles.hint}>
            Manage your block list. Unblocking does not notify the user. Previously blocked profiles do not automatically reappear in recommendations.
          </Text>
          <ListRow
            title="View blocked users"
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/account/blocked-users");
            }}
            style={styles.plainRow}
            leading={<Ionicons name="remove-circle-outline" size={22} color={theme.colors.primary} />}
          />
        </Card>
      </ScrollView>
    </SafeScreenView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.backgroundMuted },
    scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.huge },
    sectionTitle: {
      ...theme.type.overline,
      fontFamily: theme.type.overline.fontFamily,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.sm,
      marginLeft: theme.spacing.xxs,
    },
    card: { marginBottom: theme.spacing.xxl, overflow: "hidden" },
    row: { paddingHorizontal: theme.spacing.lg },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    plainRow: { paddingHorizontal: 0 },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: theme.radii.sm,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.primary + "15",
    },
    hint: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.sm,
    },
  });
}
