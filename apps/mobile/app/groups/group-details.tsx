import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Share, Alert, ActivityIndicator } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { getGroupDetails, ensureGroupInviteCode, type GroupDetails } from "@/lib/groups/groupsApi";

export default function GroupDetailsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const { id, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const groupId = String(id ?? "");

  const [details, setDetails] = useState<GroupDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    if (!groupId) {
      setLoading(false);
      return;
    }
    try {
      setDetails(await getGroupDetails(groupId));
    } catch {
      // keep prior
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const groupName = details?.name ?? (name ? String(name) : t("groups.details.fallbackName"));
  const isFull = !!details && details.member_count >= details.max_members;

  const onShareInvite = async () => {
    setSharing(true);
    try {
      const code = await ensureGroupInviteCode(groupId);
      await Share.share({
        message: t("groups.details.shareMessage", { name: groupName, link: `winkly://groups/join?code=${code}` }),
      });
    } catch (e) {
      Alert.alert(t("common.error"), (e as Error).message ?? t("groups.details.linkFailed"));
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel={t("common.back")}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("groups.details.fallbackName")}</Text>
          {details?.is_admin ? (
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/groups/edit-group", params: { id: groupId, name: groupName } })}
              style={styles.editBtn}
              activeOpacity={0.9}
            >
              <Text style={styles.editText} numberOfLines={1} adjustsFontSizeToFit>{t("common.edit")}</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 70 }} />
          )}
        </View>

        {loading ? (
          <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginTop: 24 }} />
        ) : (
          <View style={styles.card}>
            <Text style={styles.title}>{groupName}</Text>
            {details?.description ? <Text style={styles.subtitle}>{details.description}</Text> : null}
            <Text style={styles.metaRow}>
              {details ? t("groups.memberCount", { count: details.member_count, max: details.max_members }) : ""}
              {isFull ? t("groups.details.fullSuffix") : ""}
            </Text>

            <View style={styles.hr} />

            <TouchableOpacity
              onPress={() => router.push({ pathname: "/groups/member-list", params: { groupId } })}
              style={styles.secondaryBtn}
              activeOpacity={0.9}
            >
              <Ionicons name="people-outline" size={18} color={theme.colors.textPrimary} />
              <Text style={styles.secondaryText}>{t("groups.details.viewMembers")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push({ pathname: "/groups/invite-to-group", params: { groupId, mode: details?.mode } })}
              style={[styles.secondaryBtn, isFull && styles.btnDisabled]}
              activeOpacity={0.9}
              disabled={isFull}
            >
              <Ionicons name="person-add-outline" size={18} color={theme.colors.textPrimary} />
              <Text style={styles.secondaryText}>{isFull ? t("groups.details.full") : t("groups.details.invitePeople")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onShareInvite}
              style={[styles.secondaryBtn, (isFull || sharing) && styles.btnDisabled]}
              activeOpacity={0.9}
              disabled={isFull || sharing}
            >
              <Ionicons name="link-outline" size={18} color={theme.colors.textPrimary} />
              <Text style={styles.secondaryText}>{sharing ? t("groups.details.preparingLink") : t("groups.details.shareLink")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push({ pathname: "/groups/group-chat", params: { groupId } })}
              style={styles.primaryBtn}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryText}>{t("groups.details.openChat")}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    scroll: { padding: 20, paddingBottom: 40 },

    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      justifyContent: "center",
      ...theme.elevation(1),
    },
    headerTitle: { ...theme.type.h2, color: theme.colors.textPrimary },
    editBtn: { width: 70, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.colors.primary, alignItems: "center" },
    editText: { ...theme.type.caption, color: theme.colors.onPrimary },

    card: { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, borderWidth: 1, borderColor: theme.colors.border, padding: 16 },
    title: { ...theme.type.h2, color: theme.colors.textPrimary, marginBottom: 6 },
    subtitle: { ...theme.type.body, color: theme.colors.textSecondary, marginBottom: 6 },
    metaRow: { ...theme.type.caption, color: theme.colors.textSecondary },

    hr: { height: 1, backgroundColor: theme.colors.border, marginVertical: 14 },

    primaryBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.radii.md, paddingVertical: 12, alignItems: "center", marginTop: 10 },
    primaryText: { ...theme.type.button, color: theme.colors.onPrimary },

    secondaryBtn: {
      flexDirection: "row",
      gap: 8,
      backgroundColor: theme.colors.backgroundMuted,
      borderRadius: theme.radii.md,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginTop: 8,
    },
    secondaryText: { ...theme.type.button, color: theme.colors.textPrimary },
    btnDisabled: { opacity: 0.5 },
  });
}
