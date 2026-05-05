// apps/mobile/app/account/payments.tsx
// Winkly – Account: Payments (placeholder until Stripe/EAS)

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Colors, Typography, Layout } from "@/constants/tokens";

export default function Payments() {
  const router = useRouter();

  const notReady = () =>
    Alert.alert("Not configured yet", "Payments will be enabled once we integrate Stripe / App Store / Play Billing.");

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9}>
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Payments</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Payment methods</Text>
          <Text style={styles.subtitle}>
            Add and manage your payment method for Premium & subscriptions. (Placeholder)
          </Text>

          <View style={styles.box}>
            <Text style={styles.boxTitle}>No payment method added</Text>
            <Text style={styles.boxText}>You’ll be able to add cards or in-app billing later.</Text>
          </View>

          <TouchableOpacity onPress={notReady} style={styles.primaryBtn} activeOpacity={0.9}>
            <Text style={styles.primaryText}>Add payment method</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/account/subscription")}
            style={styles.secondaryBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.secondaryText}>Manage subscription</Text>
          </TouchableOpacity>
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

  box: {
    backgroundColor: Colors.backgroundLight,
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 14,
    marginBottom: 14,
  },
  boxTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 6 },
  boxText: { ...Typography.body, color: Colors.gray700 },

  primaryBtn: { backgroundColor: Colors.primaryViolet, borderRadius: Layout.radii.control, paddingVertical: 12, alignItems: "center", marginBottom: 10 },
  primaryText: { ...Typography.button, color: Colors.accentYellow },

  secondaryBtn: { backgroundColor: Colors.gray100, borderRadius: Layout.radii.control, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: Colors.gray200 },
  secondaryText: { ...Typography.button, color: Colors.textPrimary },
});
