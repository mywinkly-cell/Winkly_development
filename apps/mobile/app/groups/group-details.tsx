import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Share, Alert, ActivityIndicator } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { getGroupDetails, ensureGroupInviteCode, type GroupDetails } from "@/lib/groups/groupsApi";

export default function GroupDetailsScreen() {
  const router = useRouter();
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

  const groupName = details?.name ?? String(name ?? "Group");
  const isFull = !!details && details.member_count >= details.max_members;

  const onShareInvite = async () => {
    setSharing(true);
    try {
      const code = await ensureGroupInviteCode(groupId);
      await Share.share({
        message: `Join my group "${groupName}" on Winkly: winkly://groups/join?code=${code}`,
      });
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not create an invite link.");
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Group</Text>
          {details?.is_admin ? (
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/groups/edit-group", params: { id: groupId, name: groupName } })}
              style={styles.editBtn}
              activeOpacity={0.9}
            >
              <Text style={styles.editText}>Edit</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 70 }} />
          )}
        </View>

        {loading ? (
          <ActivityIndicator size="small" color={Colors.primaryViolet} style={{ marginTop: 24 }} />
        ) : (
          <View style={styles.card}>
            <Text style={styles.title}>{groupName}</Text>
            {details?.description ? <Text style={styles.subtitle}>{details.description}</Text> : null}
            <Text style={styles.metaRow}>
              {details ? `${details.member_count} / ${details.max_members} members` : ""}
              {isFull ? "  •  Full" : ""}
            </Text>

            <View style={styles.hr} />

            <TouchableOpacity
              onPress={() => router.push({ pathname: "/groups/member-list", params: { groupId } })}
              style={styles.secondaryBtn}
              activeOpacity={0.9}
            >
              <Ionicons name="people-outline" size={18} color={Colors.textPrimary} />
              <Text style={styles.secondaryText}>View members</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push({ pathname: "/groups/invite-to-group", params: { groupId, mode: details?.mode } })}
              style={[styles.secondaryBtn, isFull && styles.btnDisabled]}
              activeOpacity={0.9}
              disabled={isFull}
            >
              <Ionicons name="person-add-outline" size={18} color={Colors.textPrimary} />
              <Text style={styles.secondaryText}>{isFull ? "Group is full" : "Invite people"}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onShareInvite}
              style={[styles.secondaryBtn, (isFull || sharing) && styles.btnDisabled]}
              activeOpacity={0.9}
              disabled={isFull || sharing}
            >
              <Ionicons name="link-outline" size={18} color={Colors.textPrimary} />
              <Text style={styles.secondaryText}>{sharing ? "Preparing link…" : "Share invite link"}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push({ pathname: "/groups/group-chat", params: { groupId } })}
              style={styles.primaryBtn}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryText}>Open group chat</Text>
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
  editBtn: { width: 70, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.primaryViolet, alignItems: "center" },
  editText: { ...Typography.caption, color: Colors.accentYellow },

  card: { backgroundColor: "#FFF", borderRadius: Layout.radii.card, borderWidth: 1, borderColor: Colors.gray200, padding: 16 },
  title: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 6 },
  subtitle: { ...Typography.body, color: Colors.gray700, marginBottom: 6 },
  metaRow: { ...Typography.caption, color: Colors.gray600 },

  hr: { height: 1, backgroundColor: Colors.gray200, marginVertical: 14 },

  primaryBtn: { backgroundColor: Colors.primaryViolet, borderRadius: Layout.radii.control, paddingVertical: 12, alignItems: "center", marginTop: 10 },
  primaryText: { ...Typography.button, color: Colors.accentYellow },

  secondaryBtn: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: Colors.gray100,
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.gray200,
    marginTop: 8,
  },
  secondaryText: { ...Typography.button, color: Colors.textPrimary },
  btnDisabled: { opacity: 0.5 },
});
