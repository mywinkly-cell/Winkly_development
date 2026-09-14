// app/account/profile-settings.tsx
import React, { useCallback, useEffect, useState } from "react";
import { Text, ScrollView, Alert, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/providers";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Card, Header, ListRow, PrimaryButton, SecondaryButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
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
  const theme = useAppTheme();
  const styles = createStyles(theme);
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
    const targetLabel = target === "personal" ? t("auth.accountTypePersonal") : t("auth.accountTypeBusiness");
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
    <SafeScreenView style={styles.screen}>
      <Header title="Profile Settings" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Core profile</Text>
          <Text style={styles.cardSubtitle}>Name, photos, bio, location, languages</Text>
          <PrimaryButton title="Open Core Profile" onPress={() => router.push("/profile")} style={styles.actionBtn} />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Sub-profiles</Text>
          <Text style={styles.cardSubtitle}>Friends & Business preferences, interests, goals</Text>
          <SecondaryButton title="Manage Sub-profiles (placeholder)" onPress={() => router.push("/profile")} style={styles.actionBtn} />
        </Card>

        <Card padding="none" style={styles.card}>
          <Text style={{ ...styles.cardTitle, padding: theme.spacing.lg, paddingBottom: 0 }}>Account</Text>
          <ListRow title="Open Account Hub" onPress={() => router.push("/account")} style={styles.row} />
          <ListRow
            title={switchLabel}
            onPress={handleSwitchAccountType}
            disabled={switching}
            style={styles.row}
          />
          <ListRow
            title="Delete / Deactivate"
            destructive
            onPress={() => router.push("/account/delete-deactivate")}
            style={styles.row}
          />
        </Card>
      </ScrollView>
    </SafeScreenView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.backgroundMuted },
    scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.huge },
    card: { marginBottom: theme.spacing.md, overflow: "hidden" },
    cardTitle: {
      ...theme.type.h3,
      fontFamily: theme.type.h3.fontFamily,
      color: theme.colors.textPrimary,
    },
    cardSubtitle: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.xxs,
    },
    actionBtn: { marginTop: theme.spacing.md },
    row: { paddingHorizontal: theme.spacing.lg },
  });
}
