// apps/mobile/app/account/legal.tsx
// Winkly – Account: Legal information (Terms, Privacy, Cookies, Data protection, Imprint)
// Reachable from General settings → Support & legal → Legal

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, Linking, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";

const URL_TERMS = "https://winkly.app/terms";
const URL_PRIVACY = "https://winkly.app/privacy";
const URL_COOKIES = "https://winkly.app/privacy#cookies";
const URL_COMMUNITY = "https://winkly.app/community";
const URL_IMPRINT = "https://winkly.app/imprint";
const MAIL_SUPPORT = "mailto:support@winkly.app";

export default function Legal() {
  const router = useRouter();

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

  const Row = ({ title, onPress }: { title: string; onPress: () => void }) => (
    <TouchableOpacity onPress={onPress} style={styles.row} activeOpacity={0.9}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Ionicons name="open-outline" size={18} color={Colors.primaryViolet} />
    </TouchableOpacity>
  );

  return (
    <SafeScreenView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); router.back(); }}
          style={styles.backBtn}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Legal</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Terms & policies</Text>
          <Text style={styles.sectionSubtitle}>
            Terms of Service, Privacy Policy, Cookie notice, and Community Guidelines.
          </Text>
          <Row title="Terms of Service" onPress={() => openUrl(URL_TERMS)} />
          <View style={styles.hr} />
          <Row title="Privacy Policy" onPress={() => openUrl(URL_PRIVACY)} />
          <View style={styles.hr} />
          <Row title="Cookies" onPress={() => openUrl(URL_COOKIES)} />
          <View style={styles.hr} />
          <Row title="Community Guidelines" onPress={() => openUrl(URL_COMMUNITY)} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Data protection & Imprint</Text>
          <Text style={styles.sectionSubtitle}>
            How we protect your data and legal information (Impressum).
          </Text>
          <Row title="Data protection" onPress={() => openUrl(URL_PRIVACY)} />
          <View style={styles.hr} />
          <Row title="Imprint (Impressum)" onPress={() => openUrl(URL_IMPRINT)} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Contact</Text>
          <Row title="Contact Support" onPress={openMail} />
        </View>

        <Text style={styles.note}>
          If a link does not open, the page may not be published yet. Contact support for a copy of our policies.
        </Text>
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
    paddingVertical: 12,
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
    ...Shadow.card,
  },
  headerTitle: { ...Typography.headerTitle, fontFamily: FontFamily.heading, color: Colors.textPrimary },
  placeholder: { width: 44 },
  scroll: { padding: Layout.screenPadding, paddingBottom: 40 },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    padding: 16,
    marginBottom: 20,
    ...Shadow.card,
  },
  sectionTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 6 },
  sectionSubtitle: { ...Typography.body, color: Colors.gray600, marginBottom: 14 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  rowTitle: { ...Typography.body, color: Colors.textPrimary },
  hr: { height: 1, backgroundColor: Colors.gray200 },
  note: { ...Typography.caption, color: Colors.gray600, marginTop: 8, textAlign: "center" },
});
