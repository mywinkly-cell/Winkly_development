// ────────────────────────────────────────────────
// Winkly — Account & Identity (Settings v8)
// Email, phone, password, account type, delete account
// ────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Alert,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Card, Header, ListRow, PrimaryButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { isAccountTypeAvailable } from "@/lib/modes/availability";
import type { AccountType } from "@/types";
import {
  accountTypeActionVerb,
  fetchAccountProfileStatus,
  routeAfterAccountTypeChange,
  setActiveAccountType,
  type AccountProfileStatus,
} from "@/lib/account/accountTypeSwitch";

export default function AccountIdentity() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, accountType } = useAuth();
  const [switching, setSwitching] = useState(false);
  const [email, setEmail] = useState<string>("");
  const [profileStatus, setProfileStatus] = useState<AccountProfileStatus | null>(null);

  useEffect(() => {
    if (user?.email) setEmail(user.email);
  }, [user?.email]);

  const loadProfileStatus = useCallback(async () => {
    if (!user?.id) return;
    const status = await fetchAccountProfileStatus(user.id);
    setProfileStatus(status);
  }, [user?.id]);

  useEffect(() => {
    void loadProfileStatus();
  }, [loadProfileStatus]);

  const currentType = (accountType as AccountType) || "personal";
  const targetType: AccountType = currentType === "personal" ? "business" : "personal";
  const targetLabel =
    targetType === "personal" ? t("auth.accountTypePersonal") : t("auth.accountTypeBusiness");
  const verb = profileStatus ? accountTypeActionVerb(targetType, profileStatus) : "switch";

  const actionLabel =
    targetType === "business"
      ? verb === "create"
        ? t("auth.createBusinessAccount")
        : t("auth.switchToBusinessAccount")
      : verb === "create"
        ? t("auth.createPersonalAccount")
        : t("auth.switchToPersonalAccount");

  const handleSwitchAccountType = () => {
    if (!user?.id) return;
    Haptics.selectionAsync();
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
          try {
            await setActiveAccountType(targetType);
            const status = await fetchAccountProfileStatus(user.id);
            setProfileStatus(status);
            await routeAfterAccountTypeChange(router, targetType, status);
          } catch (err: unknown) {
            Alert.alert(t("common.error"), (err as Error)?.message ?? t("auth.oauthFailed"));
          } finally {
            setSwitching(false);
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    router.push("/account/delete-deactivate");
  };

  const theme = useAppTheme();
  const styles = createStyles(theme);

  return (
    <SafeScreenView style={styles.screen}>
      <Header title="Account & Identity" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Contact information</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{email || "—"}</Text>
          </View>
          <Text style={styles.hint}>To change your email, sign out and create a new account.</Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t("auth.accountType")}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Current</Text>
            <Text style={{ ...styles.value, textTransform: "capitalize" }}>
              {currentType === "personal" ? t("auth.accountTypePersonal") : t("auth.accountTypeBusiness")}
            </Text>
          </View>
          {profileStatus ? (
            <View style={styles.profileBadges}>
              {profileStatus.hasPersonal ? (
                <Text style={styles.badge}>{t("auth.accountTypePersonal")} ✓</Text>
              ) : null}
              {profileStatus.hasBusiness ? (
                <Text style={styles.badge}>{t("auth.accountTypeBusiness")} ✓</Text>
              ) : null}
            </View>
          ) : null}
          {isAccountTypeAvailable(targetType) ? (
            <>
              <PrimaryButton
                title={actionLabel}
                onPress={handleSwitchAccountType}
                loading={switching}
                disabled={switching}
                icon={<Ionicons name="arrow-forward" size={18} color={theme.colors.onPrimary} />}
                style={styles.primaryBtn}
              />
              <Text style={styles.hint}>{t("auth.accountTypeSwitchHint")}</Text>
            </>
          ) : null}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Security</Text>
          <ListRow
            title="Change password"
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/(auth)/reset-password");
            }}
            style={styles.linkRow}
          />
        </Card>

        <Card style={{ ...styles.card, ...styles.dangerCard }}>
          <Text style={styles.cardTitle}>Danger zone</Text>
          <ListRow
            title="Delete or deactivate account"
            destructive
            onPress={handleDeleteAccount}
            leading={<Ionicons name="trash-outline" size={20} color={theme.colors.error} />}
            style={styles.dangerBtn}
          />
          <Text style={styles.hint}>
            Multi-step confirmation required. This action can be permanent.
          </Text>
        </Card>
      </ScrollView>
    </SafeScreenView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.backgroundMuted },
    scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.huge },
    card: { marginBottom: theme.spacing.lg },
    dangerCard: { borderWidth: 1, borderColor: theme.colors.border },
    cardTitle: {
      ...theme.type.h3,
      fontFamily: theme.type.h3.fontFamily,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.md,
    },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: theme.spacing.sm },
    label: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary },
    value: { ...theme.type.bodyMedium, fontFamily: theme.type.bodyMedium.fontFamily, color: theme.colors.textPrimary },
    profileBadges: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginBottom: theme.spacing.xxs },
    badge: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.primary,
      backgroundColor: theme.colors.backgroundMuted,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xxs,
      borderRadius: theme.radii.sm,
      overflow: "hidden",
    },
    hint: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.sm,
    },
    primaryBtn: { marginTop: theme.spacing.sm },
    linkRow: { paddingHorizontal: 0 },
    dangerBtn: { paddingHorizontal: 0 },
  });
}
