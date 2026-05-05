// app/account/profile-settings.tsx
import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers";
import { Colors, Typography, Layout } from "@/constants/tokens";

export default function ProfileSettingsScreen() {
  const router = useRouter();
  const { accountType } = useAuth();
  const [switching, setSwitching] = useState(false);

  const handleSwitchAccountType = async () => {
    const current = (accountType as string) || "personal";
    const target = current === "personal" ? "business" : "personal";
    const targetLabel = target === "personal" ? "Personal" : "Business";
    Alert.alert(
      `Switch to ${targetLabel} Account`,
      `You'll need to complete the ${targetLabel.toLowerCase()} profile setup. Continue?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch",
          onPress: async () => {
            setSwitching(true);
            Haptics.selectionAsync();
            try {
              const { error } = await supabase.auth.updateUser({ data: { account_type: target } });
              if (error) throw error;
              if (target === "business") {
                router.replace("/(onboarding-business)/get-started-business");
              } else {
                router.replace("/(onboarding-personal)/profile-core?edit=1");
              }
            } catch (err: any) {
              Alert.alert("Error", err?.message ?? "Could not switch account type.");
            } finally {
              setSwitching(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
      {/* Simple header (no dependency on your custom Header to avoid breaking anything) */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.9}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>

        <Text style={{ ...Typography.h3, color: Colors.textPrimary }}>
          Profile Settings
        </Text>

        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingBottom: 40,
        }}
      >
        {/* Core profile */}
        <View
          style={{
            backgroundColor: "#FFF",
            borderRadius: Layout.radii.card,
            padding: 16,
            marginBottom: 12,
          }}
        >
          <Text style={{ ...Typography.h3, color: Colors.textPrimary }}>
            Core profile
          </Text>
          <Text style={{ ...Typography.caption, color: Colors.gray700, marginTop: 4 }}>
            Name, photos, bio, location, languages
          </Text>

          <TouchableOpacity
            onPress={() => router.push("/profile")}
            style={{
              marginTop: 12,
              borderRadius: Layout.radii.control,
              paddingVertical: 12,
              alignItems: "center",
              backgroundColor: Colors.primaryViolet,
            }}
          >
            <Text style={{ ...Typography.button, color: "#FFF" }}>
              Open Core Profile
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sub-profiles */}
        <View
          style={{
            backgroundColor: "#FFF",
            borderRadius: Layout.radii.card,
            padding: 16,
            marginBottom: 12,
          }}
        >
          <Text style={{ ...Typography.h3, color: Colors.textPrimary }}>
            Sub-profiles
          </Text>
          <Text style={{ ...Typography.caption, color: Colors.gray700, marginTop: 4 }}>
            Friends & Business preferences, interests, goals
          </Text>

          {/* These routes are placeholders — keep minimal and safe.
              If you already have specific routes, tell me and I’ll point exactly there. */}
          <TouchableOpacity
            onPress={() => router.push("/profile")}
            style={{
              marginTop: 12,
              borderRadius: Layout.radii.control,
              paddingVertical: 12,
              alignItems: "center",
              backgroundColor: Colors.gray100,
            }}
          >
            <Text style={{ ...Typography.button, color: Colors.textPrimary }}>
              Manage Sub-profiles (placeholder)
            </Text>
          </TouchableOpacity>
        </View>

        {/* Account actions */}
        <View
          style={{
            backgroundColor: "#FFF",
            borderRadius: Layout.radii.card,
            padding: 16,
          }}
        >
          <Text style={{ ...Typography.h3, color: Colors.textPrimary }}>
            Account
          </Text>

          <TouchableOpacity
            onPress={() => router.push("/account")}
            style={{ paddingVertical: 12 }}
          >
            <Text style={{ ...Typography.body, color: Colors.primaryViolet }}>
              Open Account Hub
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSwitchAccountType}
            disabled={switching}
            style={{ paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <Text style={{ ...Typography.body, color: Colors.primaryViolet }}>
              {((accountType as string) || "personal") === "personal" ? "Switch to Business Account" : "Switch to Personal Account"}
            </Text>
            {switching && <ActivityIndicator size="small" color={Colors.primaryViolet} />}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/account/delete-deactivate")}
            style={{ paddingVertical: 12 }}
          >
            <Text style={{ ...Typography.body, color: Colors.accentCoral }}>
              Delete / Deactivate
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
