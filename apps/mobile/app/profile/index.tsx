// apps/mobile/app/profile/index.tsx
// Winkly – Profile Hub (v7.0, SDK 54 safe)
// Purpose: Premium profile hub with edit shortcuts + verification entry.

import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";

export default function ProfileIndex() {
  const router = useRouter();

  const onSignOut = async () => {
    try {
      await supabase.auth.signOut();
      router.replace("/(auth)/signin");
    } catch {
      Alert.alert("Error", "Could not sign out. Please try again.");
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity onPress={onSignOut} style={styles.ghostBtn} activeOpacity={0.9}>
            <Text style={styles.ghostText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.avatarWrap}>
            <Image
              source={require("../../assets/icons/winkly-emoji-shadow.png")}
              style={styles.avatar}
              resizeMode="contain"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>Your Winkly Profile</Text>
            <Text style={styles.meta}>Edit your core profile and mode-specific sections.</Text>

            <TouchableOpacity
              onPress={() => router.push("/profile/view-profile")}
              style={styles.primaryBtn}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryText}>View profile</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Edit sections</Text>

        <Row
          title="Core profile"
          subtitle="Name, bio, city, languages, basics"
          onPress={() => router.push("/profile/edit-core")}
        />
        <Row
          title="Romance"
          subtitle="Preferences, relationship goals, dating details"
          onPress={() => router.push("/profile/edit-romance")}
        />
        <Row
          title="Friends"
          subtitle="Interests, activities, meetup style"
          onPress={() => router.push("/profile/edit-friends")}
        />
        <Row
          title="Business"
          subtitle="Role, company, networking focus"
          onPress={() => router.push("/profile/edit-business")}
        />
        <Row
          title="Media"
          subtitle="Photos and profile visuals"
          onPress={() => router.push("/profile/edit-media")}
        />
        <Row
          title="Verification"
          subtitle="Identity & trust checks (later: KYC)"
          onPress={() => router.push("/profile/verification")}
        />
      </ScrollView>
    </View>
  );
}

function Row({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.rowCard} activeOpacity={0.9}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.rowCTA}>Open</Text>
    </TouchableOpacity>
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

  ghostBtn: {
    width: 70,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.gray200,
    alignItems: "center",
  },
  ghostText: { ...Typography.caption, color: Colors.textPrimary },

  heroCard: {
    backgroundColor: "#FFF",
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 16,
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  avatarWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: { width: 54, height: 54 },
  name: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 4 },
  meta: { ...Typography.body, color: Colors.gray700, marginBottom: 10 },

  primaryBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryText: { ...Typography.button, color: Colors.accentYellow },

  sectionTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 10 },

  rowCard: {
    backgroundColor: "#FFF",
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 4 },
  rowSubtitle: { ...Typography.body, color: Colors.gray700 },
  rowCTA: { ...Typography.caption, color: Colors.primaryViolet },
});
