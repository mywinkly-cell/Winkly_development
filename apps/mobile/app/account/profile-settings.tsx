// app/account/profile-settings.tsx
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/providers";
import { Colors, Typography, Layout } from "@/constants/tokens";
import type { AccountType } from "@/types";
import {
  accountTypeActionVerb,
  fetchAccountProfileStatus,
  routeAfterAccountTypeChange,
  setActiveAccountType,
  type AccountProfileStatus,
} from "@/lib/account/accountTypeSwitch";

export default function ProfileSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, accountType } = useAuth();
  const [switching, setSwitching] = useState(false);
  const [profileStatus, setProfileStatus] = useState<AccountProfileStatus | null>(null);

  const loadProfileStatus = useCallback(async () => {
    if (!user?.id) return;
    const status = await fetchAccountProfileStatus(user.id);
    setProfileStatus(status);
  }, [user?.id]);

  useEffect(() => {
    void loadProfileStatus();
  }, [loadProfileStatus]);

  const current = (accountType as AccountType) || "personal";
  const target: AccountType = current === "personal" ? "business" : "personal";
  const verb = profileStatus ? accountTypeActionVerb(target, profileStatus) : "switch";
  const switchLabel =
    target === "business"
      ? verb === "create"
        ? t("auth.createBusinessAccount")
        : t("auth.switchToBusinessAccount")
      : verb === "create"
        ? t("auth.createPersonalAccount")
        : t("auth.switchToPersonalAccount");

  const handleSwitchAccountType = async () => {
    if (!user?.id) return;
    const targetLabel =
      target === "personal" ? t("auth.accountTypePersonal") : t("auth.accountTypeBusiness");
    const title =
      verb === "create"
        ? t("auth.createAccountTypeTitle", { type: targetLabel })
        : t("auth.switchAccountTypeTitle", { type: targetLabel });
    const message =
      verb === "create"
        ? t("auth.createAccountTypeMessage", { type: targetLabel.toLowerCase() })
        : t("auth.switchAccountTypeMessage");

    Alert.alert(title, message, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: verb === "create" ? t("common.next") : t("common.apply"),
        onPress: async () => {
          setSwitching(true);
          Haptics.selectionAsync();
          try {
            await setActiveAccountType(target);
            const status = await fetchAccountProfileStatus(user.id);
            setProfileStatus(status);
            await routeAfterAccountTypeChange(router, target, status);
          } catch (err: unknown) {
            Alert.alert(t("common.error"), (err as Error)?.message ?? t("auth.oauthFailed"));
          } finally {
            setSwitching(false);
          }
        },
      },
    ]);
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
              {switchLabel}
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
