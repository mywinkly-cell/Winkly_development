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
import { Colors, Typography, Layout } from "@/constants/tokens";
import {
  getMyPendingGroupInvitations,
  acceptGroupInvite,
  declineGroupInvite,
  type GroupInvitationRow,
} from "@/lib/groupInvitations";

export default function GroupInvitationsScreen() {
  const router = useRouter();
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
      Alert.alert("Joined", `You joined "${inv.group_name ?? "the group"}".`);
      router.push({ pathname: "/groups/group-details", params: { id: inv.group_id, name: inv.group_name ?? "Group" } });
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not accept.");
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
      Alert.alert("Error", (e as Error).message ?? "Could not decline.");
    } finally {
      setActingId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group invitations</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primaryViolet]} />}
      >
        <Text style={styles.subtitle}>
          You have been invited to join these groups. Accept to join the group chat, or decline.
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color={Colors.primaryViolet} style={{ marginTop: 24 }} />
        ) : list.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="mail-open-outline" size={48} color={Colors.gray400} />
            <Text style={styles.emptyText}>No pending invitations</Text>
          </View>
        ) : (
          list.map((inv) => (
            <View key={inv.id} style={styles.card}>
              <Text style={styles.groupName}>{inv.group_name ?? "Group"}</Text>
              <Text style={styles.inviterLine}>
                You have been invited to join the group chat{" "}
                <Text style={styles.bold}>{`"${inv.group_name ?? "Group"}"`}</Text> created by{" "}
                <Text style={styles.bold}>{inv.inviter_display_name ?? "Someone"}</Text>.
              </Text>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.acceptBtn, actingId === inv.id && styles.btnDisabled]}
                  onPress={() => handleAccept(inv)}
                  disabled={actingId !== null}
                  activeOpacity={0.9}
                >
                  {actingId === inv.id ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.acceptBtnText}>Accept</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.declineBtn, actingId === inv.id && styles.btnDisabled]}
                  onPress={() => handleDecline(inv)}
                  disabled={actingId !== null}
                  activeOpacity={0.9}
                >
                  <Text style={styles.declineBtnText}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { ...Typography.headerTitle, color: Colors.textPrimary },
  scroll: { padding: 20, paddingBottom: 40 },
  subtitle: { ...Typography.body, color: Colors.gray700, marginBottom: 16 },
  empty: { alignItems: "center", marginTop: 32 },
  emptyText: { ...Typography.body, color: Colors.gray500, marginTop: 12 },
  card: {
    backgroundColor: "#FFF",
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 16,
    marginBottom: 12,
  },
  groupName: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 8 },
  inviterLine: { ...Typography.body, color: Colors.gray700, marginBottom: 14 },
  bold: { fontWeight: "600", color: Colors.textPrimary },
  actions: { flexDirection: "row", gap: 12 },
  acceptBtn: {
    flex: 1,
    backgroundColor: Colors.primaryViolet,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  acceptBtnText: { ...Typography.button, color: Colors.accentYellow },
  declineBtn: {
    flex: 1,
    backgroundColor: Colors.gray100,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  declineBtnText: { ...Typography.button, color: Colors.textPrimary },
  btnDisabled: { opacity: 0.6 },
});
