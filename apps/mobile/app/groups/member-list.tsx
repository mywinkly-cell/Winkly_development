import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Colors, Typography, Layout } from "@/constants/tokens";
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
  const router = useRouter();
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
        Alert.alert("Invitation sent", `${s.display_name} was invited to the group.`);
      })
      .catch((e) => Alert.alert("Error", (e as Error)?.message ?? "Could not invite."))
      .finally(() => setBusy(false));
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRemove = (member: GroupMember) => {
    Alert.alert("Remove member", `Remove ${member.display_name} from this group?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await removeGroupMember(gid, member.user_id);
            await load();
          } catch (e) {
            Alert.alert("Error", (e as Error).message ?? "Could not remove member.");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const onLeave = () => {
    Alert.alert("Leave group", "You will no longer receive messages from this group.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await leaveGroup(gid);
            router.back();
          } catch (e) {
            Alert.alert("Error", (e as Error).message ?? "Could not leave group.");
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
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Members</Text>
          <View style={{ width: 70 }} />
        </View>

        {loading ? (
          <ActivityIndicator size="small" color={Colors.primaryViolet} style={{ marginTop: 24 }} />
        ) : (
          <View style={styles.card}>
            <Text style={styles.title}>{details?.name ?? "Group"}</Text>
            <Text style={styles.subtitle}>
              {details ? `${details.member_count} / ${details.max_members} members` : ""}
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
                      {m.display_name}
                      {isMe ? " (You)" : ""}
                    </Text>
                    <Text style={styles.role}>{m.role === "admin" || m.role === "owner" ? "Host" : "Member"}</Text>
                  </View>
                  {canRemove ? (
                    <TouchableOpacity onPress={() => onRemove(m)} disabled={busy} style={styles.removeBtn} activeOpacity={0.85}>
                      <Text style={styles.removeText}>Remove</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}

            {isAdmin && suggestions.length > 0 ? (
              <View style={styles.suggestBox}>
                <Text style={styles.suggestTitle}>Bring a friend</Text>
                {suggestions.map((s) => (
                  <View key={s.user_id} style={styles.suggestRow}>
                    {s.avatar_url ? (
                      <Image source={{ uri: s.avatar_url }} style={styles.avatarSmall} />
                    ) : (
                      <View style={styles.avatarFallbackSmall}>
                        <Text style={styles.avatarText}>{s.display_name.slice(0, 1).toUpperCase()}</Text>
                      </View>
                    )}
                    <Text style={styles.suggestText} numberOfLines={2}>
                      Add {s.display_name}? They&apos;re into {s.shared_interest} too.
                    </Text>
                    <TouchableOpacity onPress={() => onAddSuggested(s)} disabled={busy} style={styles.addBtn} activeOpacity={0.85}>
                      <Text style={styles.addText}>Add</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}

            <TouchableOpacity onPress={onLeave} disabled={busy} style={styles.leaveBtn} activeOpacity={0.85}>
              <Ionicons name="exit-outline" size={18} color={Colors.errorRed} />
              <Text style={styles.leaveText}>Leave group</Text>
            </TouchableOpacity>
          </View>
        )}
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
  headerTitle: { ...Typography.headerTitle, color: Colors.textPrimary },

  card: { backgroundColor: "#FFF", borderRadius: Layout.radii.card, borderWidth: 1, borderColor: Colors.gray200, padding: 16 },
  title: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 4 },
  subtitle: { ...Typography.caption, color: Colors.gray600 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryViolet + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { ...Typography.body, fontWeight: "700", color: Colors.primaryViolet },
  name: { ...Typography.body, color: Colors.textPrimary },
  role: { ...Typography.caption, color: Colors.gray600, marginTop: 2 },

  removeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.gray300,
  },
  removeText: { ...Typography.caption, color: Colors.errorRed, fontWeight: "600" },

  suggestBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.primaryViolet + "0A",
    borderWidth: 1,
    borderColor: Colors.primaryViolet + "33",
  },
  suggestTitle: { ...Typography.caption, fontWeight: "700", color: Colors.primaryViolet, marginBottom: 8 },
  suggestRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  avatarSmall: { width: 32, height: 32, borderRadius: 16 },
  avatarFallbackSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primaryViolet + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  suggestText: { flex: 1, ...Typography.caption, color: Colors.textPrimary },
  addBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.primaryViolet,
  },
  addText: { ...Typography.caption, color: "#FFF", fontWeight: "700" },

  leaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: Layout.radii.control,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  leaveText: { ...Typography.button, color: Colors.errorRed },
});
