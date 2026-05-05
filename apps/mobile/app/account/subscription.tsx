// apps/mobile/app/account/subscription.tsx
// Winkly – Account: Subscription (placeholder)

import React from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";

export default function Subscription() {
  const router = useRouter();

  const notReady = () =>
    Alert.alert(
      "Subscriptions not enabled",
      "We’ll connect this to billing later. For now, this is a UI placeholder."
    );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Subscription plans</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Your plan</Text>
          <Text style={styles.subtitle}>
            Current status is not connected yet. We’ll store it in Supabase later.
          </Text>

          <View style={styles.planBox}>
            <Text style={styles.planName}>Free</Text>
            <Text style={styles.planText}>Basic discovery & limited daily suggestions</Text>
          </View>

          <Text style={styles.sectionTitle}>Tariffs</Text>
          <Text style={styles.tariffHint}>Choose the plan that fits you. Tariff options we&apos;ll add later.</Text>

          <View style={styles.planOption}>
            <Text style={styles.planOptionTitle}>Super</Text>
            <Text style={styles.planOptionSub}>More Super Sparks per day, extra filters</Text>
            <TouchableOpacity onPress={notReady} style={styles.primaryBtn} activeOpacity={0.9}>
              <Text style={styles.primaryText}>Choose Super</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.hr} />

          <View style={styles.planOption}>
            <Text style={styles.planOptionTitle}>Premium</Text>
            <Text style={styles.planOptionSub}>AI-powered matching, all features</Text>
            <TouchableOpacity onPress={notReady} style={styles.primaryBtn} activeOpacity={0.9}>
              <Text style={styles.primaryText}>Choose Premium</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => router.push("/account/payments")}
            style={styles.secondaryBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.secondaryText}>Payment methods</Text>
          </TouchableOpacity>

          <Text style={styles.note}>
            Next step: integrate billing + store entitlements, then show “Active until …” here.
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

  planBox: {
    backgroundColor: Colors.backgroundLight,
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 14,
    marginBottom: 14,
  },
  planName: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 4 },
  planText: { ...Typography.body, color: Colors.gray700 },

  sectionTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 4 },
  tariffHint: { ...Typography.caption, color: Colors.gray600, marginBottom: 12 },

  planOption: { marginBottom: 10 },
  planOptionTitle: { ...Typography.body, color: Colors.textPrimary, marginBottom: 4 },
  planOptionSub: { ...Typography.caption, color: Colors.gray600, marginBottom: 10 },

  primaryBtn: { backgroundColor: Colors.primaryViolet, borderRadius: Layout.radii.control, paddingVertical: 12, alignItems: "center" },
  primaryText: { ...Typography.button, color: Colors.accentYellow },

  secondaryBtn: { backgroundColor: Colors.gray100, borderRadius: Layout.radii.control, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: Colors.gray200, marginTop: 10 },
  secondaryText: { ...Typography.button, color: Colors.textPrimary },

  hr: { height: 1, backgroundColor: Colors.gray200, marginVertical: 12 },
  note: { ...Typography.caption, color: Colors.gray600, marginTop: 12, textAlign: "center" },
});
