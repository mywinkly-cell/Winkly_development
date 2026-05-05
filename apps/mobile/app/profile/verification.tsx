// apps/mobile/app/profile/verification.tsx
// Winkly – Profile: Verification (safe placeholder)
// Notes: No camera/KYC libs yet. This is UI + future wiring points.

import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Colors, Typography, Layout } from "@/constants/tokens";

type Step = {
  id: string;
  title: string;
  subtitle: string;
  done: boolean;
};

export default function Verification() {
  const router = useRouter();

  const [steps, setSteps] = useState<Step[]>([
    { id: "email", title: "Email verified", subtitle: "Confirm your email via verification link.", done: false },
    { id: "photo", title: "Profile photo", subtitle: "Add at least one premium-quality photo.", done: false },
    { id: "selfie", title: "Selfie check (later)", subtitle: "Liveness verification with selfie video.", done: false },
    { id: "id", title: "ID check (later)", subtitle: "Optional government ID verification.", done: false },
  ]);

  const toggleDone = (id: string) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
  };

  const requestVerification = () => {
    Alert.alert("Verification", "Placeholder. Next: submit verification state to Supabase + moderation queue.");
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9}>
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Verification</Text>
          <View style={{ width: 70 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Build trust</Text>
          <Text style={styles.subtitle}>
            Verified users get better visibility and higher-quality connections. (MVP: UI placeholder)
          </Text>

          {steps.map((s) => (
            <TouchableOpacity key={s.id} onPress={() => toggleDone(s.id)} style={styles.stepRow} activeOpacity={0.9}>
              <View style={[styles.stepDot, s.done ? styles.dotDone : styles.dotTodo]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepSub}>{s.subtitle}</Text>
              </View>
              <Text style={styles.stepCTA}>{s.done ? "Done" : "Mark"}</Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity onPress={requestVerification} style={styles.primaryBtn} activeOpacity={0.9}>
            <Text style={styles.primaryText}>Request verification</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/profile/edit-media")} style={styles.secondaryBtn} activeOpacity={0.9}>
            <Text style={styles.secondaryText}>Go to media</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.note}>Next: connect to actual email-confirm status + KYC provider later.</Text>
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

  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
  stepDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  dotDone: { backgroundColor: Colors.accentMint ?? Colors.primaryViolet },
  dotTodo: { backgroundColor: Colors.gray400 },

  stepTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 2 },
  stepSub: { ...Typography.body, color: Colors.gray700 },
  stepCTA: { ...Typography.caption, color: Colors.primaryViolet, marginTop: 2 },

  primaryBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 16,
  },
  primaryText: { ...Typography.button, color: Colors.accentYellow },

  secondaryBtn: {
    backgroundColor: Colors.gray100,
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.gray200,
    marginTop: 10,
  },
  secondaryText: { ...Typography.button, color: Colors.textPrimary },

  note: { ...Typography.caption, color: Colors.gray600, textAlign: "center", marginTop: 12 },
});
