// ────────────────────────────────────────────────
// Winkly — Account & Identity (Settings v8)
// Email, phone, password, account type, delete account
// ────────────────────────────────────────────────

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";

export default function AccountIdentity() {
  const router = useRouter();
  const { user, accountType } = useAuth();
  const [switching, setSwitching] = useState(false);
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    if (user?.email) setEmail(user.email);
  }, [user?.email]);

  const currentType = (accountType as string) || "personal";
  const targetType = currentType === "personal" ? "business" : "personal";
  const targetLabel = targetType === "personal" ? "Personal" : "Business";

  const handleSwitchAccountType = () => {
    Haptics.selectionAsync();
    Alert.alert(
      `Switch to ${targetLabel} Account`,
      `You'll need to complete the ${targetLabel.toLowerCase()} profile setup. Your existing sub-profiles remain intact. Continue?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch",
          onPress: async () => {
            setSwitching(true);
            try {
              const { error } = await supabase.auth.updateUser({ data: { account_type: targetType } });
              if (error) throw error;
              if (targetType === "business") {
                router.replace("/(onboarding-business)/get-started-business");
              } else {
                router.replace("/(onboarding-personal)/profile-core?edit=1");
              }
            } catch (err: unknown) {
              Alert.alert("Error", (err as Error)?.message ?? "Could not switch account type.");
            } finally {
              setSwitching(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    router.push("/account/delete-deactivate");
  };

  return (
    <SafeScreenView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account & Identity</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Contact information</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{email || "—"}</Text>
          </View>
          <Text style={styles.hint}>To change your email, sign out and create a new account.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account type</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Current</Text>
            <Text style={[styles.value, { textTransform: "capitalize" }]}>{currentType}</Text>
          </View>
          <TouchableOpacity
            onPress={handleSwitchAccountType}
            disabled={switching}
            style={styles.primaryBtn}
            activeOpacity={0.8}
          >
            {switching ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <>
                <Text style={styles.primaryBtnText}>Switch to {targetLabel} Account</Text>
                <Ionicons name="arrow-forward" size={18} color={Colors.white} />
              </>
            )}
          </TouchableOpacity>
          <Text style={styles.hint}>
            Switching affects feature availability. Sub-profiles remain intact.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Security</Text>
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/(auth)/reset-password");
            }}
            style={styles.linkRow}
            activeOpacity={0.7}
          >
            <Text style={styles.linkText}>Change password</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
          </TouchableOpacity>
        </View>

        <View style={[styles.card, styles.dangerCard]}>
          <Text style={styles.cardTitle}>Danger zone</Text>
          <TouchableOpacity
            onPress={handleDeleteAccount}
            style={styles.dangerBtn}
            activeOpacity={0.8}
          >
            <Ionicons name="trash-outline" size={20} color={Colors.errorRed} />
            <Text style={styles.dangerBtnText}>Delete or deactivate account</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.errorRed} />
          </TouchableOpacity>
          <Text style={styles.hint}>
            Multi-step confirmation required. This action can be permanent.
          </Text>
        </View>
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
  placeholder: { width: 40 },
  scroll: { padding: Layout.screenPadding, paddingBottom: 40 },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    padding: 20,
    marginBottom: 16,
  },
  dangerCard: { borderWidth: 1, borderColor: Colors.gray200 },
  cardTitle: {
    ...Typography.h3,
    fontFamily: FontFamily.heading,
    color: Colors.textPrimary,
    marginBottom: 14,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  label: { ...Typography.caption, color: Colors.gray600 },
  value: { ...Typography.body, fontWeight: "600", color: Colors.textPrimary },
  hint: {
    ...Typography.caption,
    color: Colors.gray600,
    marginTop: 10,
    lineHeight: 18,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primaryViolet,
    paddingVertical: 14,
    borderRadius: Layout.radii.control,
    marginTop: 8,
  },
  primaryBtnText: { ...Typography.button, color: Colors.white },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  linkText: { ...Typography.body, color: Colors.primaryViolet, fontWeight: "500" },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  dangerBtnText: { ...Typography.body, color: Colors.errorRed, fontWeight: "600" },
});
