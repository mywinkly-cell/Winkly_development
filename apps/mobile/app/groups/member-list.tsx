import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import {
  getGroupDetails,
  getGroupMembers,
  getBringAFriendSuggestions,
  leaveGroup,
  removeGroupMember,
  type GroupDetails,
  type GroupMember,
  type BringAFriendSuggestion,
} from "@/lib/groups/groupsApi";
import { inviteUsersToGroup } from "@/lib/groupInvitations";
import { supabase } from "@/lib/supabase";

export default function MemberList() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const gid = String(groupId ?? "");

  const [details, setDetails] = useState<GroupDetails | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [suggestions, setSuggestions] = useState<BringAFriendSuggestion[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!gid) {
      setLoading(false);
      return;
    }
    try {
      const { data: auth } = await supabase.auth.getUser();
      setMeId(auth.user?.id ?? null);
      const [d, m] = await Promise.all([getGroupDetails(gid), getGroupMembers(gid)]);
      setDetails(d);
      setMembers(m);
      // "Bring a friend" only when there's room and the group is in Friends mode.
      if (d && d.mode === "friends" && d.member_count < d.max_members) {
        getBringAFriendSuggestions(gid).then(setSuggestions).catch(() => setSuggestions([]));
      } else {
        setSuggestions([]);
      }
    } catch {
      // keep prior state
    } finally {
      setLoading(false);
    }
  }, [gid]);

  const onAddSuggested = (s: BringAFriendSuggestion) => {
    setBusy(true);
    inviteUsersToGroup(gid, [s.user_id])
      .then(() => {
        setSuggestions((prev) => prev.filter((x) => x.user_id !== s.user_id));
        Alert.alert(t("groups.members.invitationSent"), t("groups.members.invitedBody", { name: s.display_name }));
      })
      .catch((e) => Alert.alert(t("common.error"), (e as Error)?.message ?? t("groups.members.inviteFailed")))
      .finally(() => setBusy(false));
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRemove = (member: GroupMember) => {
    Alert.alert(t("groups.members.removeTitle"), t("groups.members.removeConfirm", { name: member.display_name }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("groups.members.remove"),
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await removeGroupMember(gid, member.user_id);
            await load();
          } catch (e) {
            Alert.alert(t("common.error"), (e as Error).message ?? t("groups.members.removeFailed"));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const onLeave = () => {
    Alert.alert(t("chat.info.leaveGroup"), t("groups.members.leaveBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("chat.info.leave"),
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await leaveGroup(gid);
            router.back();
          } catch (e) {
            Alert.alert(t("common.error"), (e as Error).message ?? t("groups.members.leaveFailed"));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const isAdmin = !!details?.is_admin;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel={t("common.back")}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("groups.members")}</Text>
          <View style={{ width: 70 }} />
        </View>

        {loading ? (
          <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginTop: 24 }} />
        ) : (
          <View style={styles.card}>
            <Text style={styles.title}>{details?.name ?? t("groups.details.fallbackName")}</Text>
            <Text style={styles.subtitle}>
              {details ? t("groups.memberCount", { count: details.member_count, max: details.max_members }) : ""}
            </Text>

            <View style={{ height: 8 }} />

            {members.map((m) => {
              const isMe = m.user_id === meId;
              const canRemove = isAdmin && !isMe;
              return (
                <View key={m.user_id} style={styles.row}>
                  {m.avatar_url ? (
                    <Image source={{ uri: m.avatar_url }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarText}>{m.display_name.slice(0, 1).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.name}>
                      {isMe ? t("chat.info.nameYou", { name: m.display_name }) : m.display_name}
                    </Text>
                    <Text style={styles.role}>{m.role === "admin" || m.role === "owner" ? t("groups.members.host") : t("chat.role.member")}</Text>
                  </View>
                  {canRemove ? (
                    <TouchableOpacity onPress={() => onRemove(m)} disabled={busy} style={styles.removeBtn} activeOpacity={0.85}>
                      <Text style={styles.removeText} numberOfLines={1} adjustsFontSizeToFit>{t("groups.members.remove")}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}

            {isAdmin && suggestions.length > 0 ? (
              <View style={styles.suggestBox}>
                <Text style={styles.suggestTitle}>{t("groups.members.bringFriend")}</Text>
                {suggestions.map((s) => (
                  <View key={s.user_id} style={styles.suggestRow}>
                    {s.avatar_url ? (
                      <Image source={{ uri: s.avatar_url }} style={styles.avatarSmall} />
                    ) : (
                      <View style={styles.avatarFallbackSmall}>
                        <Text style={styles.avatarText}>{s.display_name.slice(0, 1).toUpperCase()}</Text>
                      </View>
                    )}
                    <Text style={styles.suggestText} numberOfLines={3}>
                      {t("groups.members.suggestion", { name: s.display_name, interest: s.shared_interest })}
                    </Text>
                    <TouchableOpacity onPress={() => onAddSuggested(s)} disabled={busy} style={styles.addBtn} activeOpacity={0.85}>
                      <Text style={styles.addText} numberOfLines={1} adjustsFontSizeToFit>{t("common.add")}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}

            <TouchableOpacity onPress={onLeave} disabled={busy} style={styles.leaveBtn} activeOpacity={0.85}>
              <Ionicons name="exit-outline" size={18} color={theme.colors.error} />
              <Text style={styles.leaveText}>{t("chat.info.leaveGroup")}</Text>
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

    card: { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, borderWidth: 1, borderColor: theme.colors.border, padding: 16 },
    title: { ...theme.type.h3, color: theme.colors.textPrimary, marginBottom: 4 },
    subtitle: { ...theme.type.caption, color: theme.colors.textSecondary },

    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    avatar: { width: 40, height: 40, borderRadius: 20 },
    avatarFallback: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors.primary + "22",
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { ...theme.type.body, fontWeight: "700", color: theme.colors.primary },
    name: { ...theme.type.body, color: theme.colors.textPrimary },
    role: { ...theme.type.caption, color: theme.colors.textSecondary, marginTop: 2 },

    removeBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    removeText: { ...theme.type.caption, color: theme.colors.error, fontWeight: "600" },

    suggestBox: {
      marginTop: 16,
      padding: 12,
      borderRadius: 12,
      backgroundColor: theme.colors.primary + "0A",
      borderWidth: 1,
      borderColor: theme.colors.primary + "33",
    },
    suggestTitle: { ...theme.type.caption, fontWeight: "700", color: theme.colors.primary, marginBottom: 8 },
    suggestRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
    avatarSmall: { width: 32, height: 32, borderRadius: 16 },
    avatarFallbackSmall: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.colors.primary + "22",
      alignItems: "center",
      justifyContent: "center",
    },
    suggestText: { flex: 1, ...theme.type.caption, color: theme.colors.textPrimary },
    addBtn: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.colors.primary,
    },
    addText: { ...theme.type.caption, color: theme.colors.onPrimary, fontWeight: "700" },

    leaveBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 16,
      paddingVertical: 12,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.backgroundMuted,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    leaveText: { ...theme.type.button, color: theme.colors.error },
  });
}
