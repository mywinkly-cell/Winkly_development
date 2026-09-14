// apps/mobile/app/account/legal.tsx
// Winkly – Account: Legal information (Terms, Privacy, Cookies, Data protection, Imprint)
// Reachable from General settings → Support & legal → Legal

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, ScrollView, Alert, Linking, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Card, Header, ListRow } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

const URL_TERMS = "https://mywinkly.de/terms";
const URL_PRIVACY = "https://mywinkly.de/privacy";
const URL_COOKIES = "https://mywinkly.de/privacy#cookies";
const URL_COMMUNITY = "https://mywinkly.de/community";
const URL_IMPRINT = "https://mywinkly.de/imprint";
const MAIL_SUPPORT = "mailto:customer-care@mywinkly.de";

export default function Legal() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  const openUrl = async (url: string) => {
    Haptics.selectionAsync();
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok) throw new Error("Cannot open link");
      await Linking.openURL(url);
    } catch {
      Alert.alert("Unavailable", "Link is not configured yet. Contact support for a copy.");
    }
  };

  const openMail = () => {
    Haptics.selectionAsync();
    Linking.openURL(MAIL_SUPPORT).catch(() => {});
  };

  const Row = ({ title, onPress, last }: { title: string; onPress: () => void; last?: boolean }) => (
    <ListRow
      title={title}
      onPress={onPress}
      style={last ? styles.row : { ...styles.row, ...styles.rowBorder }}
      trailing={<Ionicons name="open-outline" size={18} color={theme.colors.primary} />}
    />
  );

  return (
    <SafeScreenView style={styles.screen}>
      <Header title="Legal" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card padding="none" style={styles.card}>
          <Text style={styles.sectionTitle}>Terms & policies</Text>
          <Text style={styles.sectionSubtitle}>
            Terms of Service, Privacy Policy, Cookie notice, and Community Guidelines.
          </Text>
          <Row title="Terms of Service" onPress={() => openUrl(URL_TERMS)} />
          <Row title="Privacy Policy" onPress={() => openUrl(URL_PRIVACY)} />
          <Row title="Cookies" onPress={() => openUrl(URL_COOKIES)} />
          <Row title="Community Guidelines" onPress={() => openUrl(URL_COMMUNITY)} last />
        </Card>

        <Card padding="none" style={styles.card}>
          <Text style={styles.sectionTitle}>Data protection & Imprint</Text>
          <Text style={styles.sectionSubtitle}>
            How we protect your data and legal information (Impressum).
          </Text>
          <Row title="Data protection" onPress={() => openUrl(URL_PRIVACY)} />
          <Row title="Imprint (Impressum)" onPress={() => openUrl(URL_IMPRINT)} last />
        </Card>

        <Card padding="none" style={styles.card}>
          <Text style={styles.sectionTitle}>Contact</Text>
          <Row title="Contact Support" onPress={openMail} last />
        </Card>

        <Text style={styles.note}>
          If a link does not open, the page may not be published yet. Contact support for a copy of our policies.
        </Text>
      </ScrollView>
    </SafeScreenView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.backgroundMuted },
    scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.huge },
    card: { marginBottom: theme.spacing.xl, overflow: "hidden" },
    sectionTitle: {
      ...theme.type.h3,
      fontFamily: theme.type.h3.fontFamily,
      color: theme.colors.textPrimary,
      padding: theme.spacing.lg,
      paddingBottom: theme.spacing.xxs,
    },
    sectionSubtitle: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textSecondary,
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.sm,
    },
    row: { paddingHorizontal: theme.spacing.lg },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    note: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.sm,
      textAlign: "center",
    },
  });
}
