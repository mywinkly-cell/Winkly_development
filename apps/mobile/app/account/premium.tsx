// apps/mobile/app/account/premium.tsx
// Winkly – Account: Premium (marketing + CTA)

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Colors, Typography, Layout } from "@/constants/tokens";

export default function Premium() {
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9}>
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Premium</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Winkly Premium</Text>
          <Text style={styles.subtitle}>
            Upgrade for better discovery, smarter suggestions, and more control. (UI placeholder — pricing later)
          </Text>

          <View style={styles.featureBox}>
            <Text style={styles.featureTitle}>What you’ll get</Text>
            <Text style={styles.featureText}>• More daily recommendations</Text>
            <Text style={styles.featureText}>• Advanced filters in Friends & Business</Text>
            <Text style={styles.featureText}>• Priority AI matches</Text>
            <Text style={styles.featureText}>• See who viewed / liked you (future)</Text>
          </View>

          <TouchableOpacity
            onPress={() => router.push("/account/subscription")}
            style={styles.primaryBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryText}>View plans</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/account/payments")}
            style={styles.secondaryBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.secondaryText}>Payment methods</Text>
          </TouchableOpacity>

          <Text style={styles.note}>
            Next step: integrate billing (App Store / Play / Stripe) and store entitlement in Supabase.
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
  headerTitle: { ...Typography.headerTitle, color: Colors.textPrimary },

  card: { backgroundColor: "#FFF", borderRadius: Layout.radii.card, borderWidth: 1, borderColor: Colors.gray200, padding: 16 },
  title: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 6 },
  subtitle: { ...Typography.body, color: Colors.gray700, marginBottom: 14 },

  featureBox: {
    backgroundColor: Colors.backgroundLight,
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 14,
    marginBottom: 14,
  },
  featureTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 8 },
  featureText: { ...Typography.body, color: Colors.gray700, marginBottom: 4 },

  primaryBtn: { backgroundColor: Colors.primaryViolet, borderRadius: Layout.radii.control, paddingVertical: 12, alignItems: "center", marginBottom: 10 },
  primaryText: { ...Typography.button, color: Colors.accentYellow },

  secondaryBtn: { backgroundColor: Colors.gray100, borderRadius: Layout.radii.control, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: Colors.gray200 },
  secondaryText: { ...Typography.button, color: Colors.textPrimary },

  note: { ...Typography.caption, color: Colors.gray600, marginTop: 12, textAlign: "center" },
});
