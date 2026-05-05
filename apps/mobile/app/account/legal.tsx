// apps/mobile/app/account/legal.tsx
// Winkly – Account: Legal (placeholder links)

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, Linking, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Colors, Typography, Layout } from "@/constants/tokens";

export default function Legal() {
  const router = useRouter();

  const openUrl = async (url: string) => {
    try {
      const ok = await Linking.canOpenURL(url);
      if (!ok) throw new Error("Cannot open link");
      await Linking.openURL(url);
    } catch {
      Alert.alert("Unavailable", "Link is not configured yet.");
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9}>
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Legal</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Terms & policies</Text>
          <Text style={styles.subtitle}>
            Configure these URLs later (website / hosted docs). For now, this page is a safe placeholder.
          </Text>

          <TouchableOpacity onPress={() => openUrl("https://winkly.app/terms")} style={styles.row} activeOpacity={0.9}>
            <Text style={styles.rowTitle}>Terms of Service</Text>
            <Text style={styles.rowHint}>Open</Text>
          </TouchableOpacity>

          <View style={styles.hr} />

          <TouchableOpacity onPress={() => openUrl("https://winkly.app/privacy")} style={styles.row} activeOpacity={0.9}>
            <Text style={styles.rowTitle}>Privacy Policy</Text>
            <Text style={styles.rowHint}>Open</Text>
          </TouchableOpacity>

          <View style={styles.hr} />

          <TouchableOpacity onPress={() => openUrl("https://winkly.app/community")} style={styles.row} activeOpacity={0.9}>
            <Text style={styles.rowTitle}>Community Guidelines</Text>
            <Text style={styles.rowHint}>Open</Text>
          </TouchableOpacity>

          <View style={styles.hr} />

          <TouchableOpacity onPress={() => openUrl("mailto:support@winkly.app")} style={styles.row} activeOpacity={0.9}>
            <Text style={styles.rowTitle}>Contact Support</Text>
            <Text style={styles.rowHint}>Email</Text>
          </TouchableOpacity>

          <Text style={styles.note}>
            Tip: once you have a domain, update these links to real pages.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  scroll: { padding: 20, paddingBottom: 40 },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
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
  headerTitle: { ...Typography.h3, color: Colors.textPrimary },

  card: { backgroundColor: "#FFF", borderRadius: Layout.radii.card, borderWidth: 1, borderColor: Colors.gray200, padding: 16 },
  title: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 6 },
  subtitle: { ...Typography.body, color: Colors.gray700, marginBottom: 14 },

  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  rowTitle: { ...Typography.body, color: Colors.textPrimary },
  rowHint: { ...Typography.caption, color: Colors.primaryViolet },

  hr: { height: 1, backgroundColor: Colors.gray200 },

  note: { ...Typography.caption, color: Colors.gray600, marginTop: 12, textAlign: "center" },
});
