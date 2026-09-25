/**
 * Group chat invitations — list pending invites; Accept or Decline.
 * No one is auto-added to group chats; this screen shows invitations you received.
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Trans, useTranslation } from "react-i18next";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import {
  getMyPendingGroupInvitations,
  acceptGroupInvite,
  declineGroupInvite,
  type GroupInvitationRow,
} from "@/lib/groupInvitations";

export default function GroupInvitationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const [list, setList] = useState<GroupInvitationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getMyPendingGroupInvitations();
      setList(data);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleAccept = async (inv: GroupInvitationRow) => {
    setActingId(inv.id);
    try {
      await acceptGroupInvite(inv.id);
      setList((prev) => prev.filter((i) => i.id !== inv.id));
      Alert.alert(
        t("groups.invitations.joinedTitle"),
        inv.group_name
          ? t("groups.invitations.joinedNamed", { name: inv.group_name })
          : t("groups.invitations.joined")
      );
      router.replace({ pathname: "/groups/group-chat", params: { groupId: inv.group_id } });
    } catch (e) {
      Alert.alert(t("common.error"), (e as Error).message ?? t("groups.invitations.acceptFailed"));
    } finally {
      setActingId(null);
    }
  };

  const handleDecline = async (inv: GroupInvitationRow) => {
    setActingId(inv.id);
    try {
      await declineGroupInvite(inv.id);
      setList((prev) => prev.filter((i) => i.id !== inv.id));
    } catch (e) {
      Alert.alert(t("common.error"), (e as Error).message ?? t("groups.invitations.declineFailed"));
    } finally {
      setActingId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel={t("common.back")}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("chat.start.groupInvitations")}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        <Text style={styles.subtitle}>
          {t("groups.invitations.subtitle")}
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 24 }} />
        ) : list.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="mail-open-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>{t("groups.invitations.empty")}</Text>
          </View>
        ) : (
          list.map((inv) => (
            <View key={inv.id} style={styles.card}>
              <Text style={styles.groupName}>{inv.group_name ?? t("groups.details.fallbackName")}</Text>
              <Text style={styles.inviterLine}>
                <Trans
                  i18nKey="groups.invitations.invitedBy"
                  values={{
                    group: inv.group_name ?? t("groups.details.fallbackName"),
                    inviter: inv.inviter_display_name ?? t("groups.invitations.someone"),
                  }}
                  components={{ bold: <Text style={styles.bold} /> }}
                />
              </Text>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.acceptBtn, actingId === inv.id && styles.btnDisabled]}
                  onPress={() => handleAccept(inv)}
                  disabled={actingId !== null}
                  activeOpacity={0.9}
                >
                  {actingId === inv.id ? (
                    <ActivityIndicator size="small" color={theme.colors.onPrimary} />
                  ) : (
                    <Text style={styles.acceptBtnText} numberOfLines={1} adjustsFontSizeToFit>{t("planner.accept")}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.declineBtn, actingId === inv.id && styles.btnDisabled]}
                  onPress={() => handleDecline(inv)}
                  disabled={actingId !== null}
                  activeOpacity={0.9}
                >
                  <Text style={styles.declineBtnText} numberOfLines={1} adjustsFontSizeToFit>{t("planner.decline")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: { ...theme.type.h2, color: theme.colors.textPrimary },
    scroll: { padding: 20, paddingBottom: 40 },
    subtitle: { ...theme.type.body, color: theme.colors.textSecondary, marginBottom: 16 },
    empty: { alignItems: "center", marginTop: 32 },
    emptyText: { ...theme.type.body, color: theme.colors.textMuted, marginTop: 12 },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
      marginBottom: 12,
    },
    groupName: { ...theme.type.h3, color: theme.colors.textPrimary, marginBottom: 8 },
    inviterLine: { ...theme.type.body, color: theme.colors.textSecondary, marginBottom: 14 },
    bold: { fontWeight: "600", color: theme.colors.textPrimary },
    actions: { flexDirection: "row", gap: 12 },
    acceptBtn: {
      flex: 1,
      backgroundColor: theme.colors.primary,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center",
    },
    acceptBtnText: { ...theme.type.button, color: theme.colors.onPrimary },
    declineBtn: {
      flex: 1,
      backgroundColor: theme.colors.backgroundMuted,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    declineBtnText: { ...theme.type.button, color: theme.colors.textPrimary },
    btnDisabled: { opacity: 0.6 },
  });
}
