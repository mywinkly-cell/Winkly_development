import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  RefreshControl,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { getMyGroups, type GroupSummary } from "@/lib/groups/groupsApi";
import { getMyPendingGroupInvitations } from "@/lib/groupInvitations";
import type { Mode } from "@/types";

type GroupsMode = Mode | undefined;

export default function GroupsIndex() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: GroupsMode }>();

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const title =
    mode === "business" ? "Business Groups" : mode === "friends" ? "Friends Groups" : "Groups";
  const subtitle =
    mode === "business"
      ? "Masterminds, industry circles, founders, hiring & partnerships."
      : mode === "friends"
        ? "Meetups, hobby clubs, local communities and activity circles."
        : "Communities for every connection.";

  const load = useCallback(async () => {
    try {
      const [g, invites] = await Promise.all([
        getMyGroups(mode as Mode | undefined),
        getMyPendingGroupInvitations(),
      ]);
      setGroups(g);
      setPendingCount(invites.length);
    } catch {
      // keep prior state on transient errors
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mode]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
      <View style={{ padding: 20, paddingBottom: 12 }}>
        <Text style={{ ...Typography.h1, color: Colors.textPrimary }}>{title}</Text>
        <Text style={{ ...Typography.body, color: Colors.gray700, marginTop: 6 }}>{subtitle}</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 4, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
          <TouchableOpacity
            onPress={() => router.push({ pathname: "/groups/create-group", params: { mode } })}
            style={{
              flex: 1,
              borderRadius: Layout.radii.control,
              paddingVertical: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor: Colors.primaryViolet,
            }}
            activeOpacity={0.9}
          >
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={{ ...Typography.button, color: "#FFF" }}>Create a group</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/groups/invitations")}
            style={{
              borderRadius: Layout.radii.control,
              paddingVertical: 12,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: Colors.gray100,
              borderWidth: 1,
              borderColor: Colors.gray200,
            }}
            activeOpacity={0.9}
            accessibilityLabel="Group invitations"
          >
            <Ionicons name="mail-outline" size={18} color={Colors.textPrimary} />
            <Text style={{ ...Typography.button, color: Colors.textPrimary }}>Invites</Text>
            {pendingCount > 0 ? (
              <View
                style={{
                  minWidth: 20,
                  height: 20,
                  borderRadius: 10,
                  paddingHorizontal: 5,
                  backgroundColor: Colors.primaryViolet,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "700" }}>{pendingCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        <Text style={{ ...Typography.h3, color: Colors.textPrimary, marginBottom: 10 }}>Your groups</Text>

        {loading ? (
          <ActivityIndicator size="small" color={Colors.primaryViolet} style={{ marginTop: 24 }} />
        ) : groups.length === 0 ? (
          <View
            style={{
              backgroundColor: "#FFF",
              borderRadius: Layout.radii.card,
              padding: 20,
              alignItems: "center",
            }}
          >
            <Ionicons name="people-outline" size={36} color={Colors.gray400} />
            <Text style={{ ...Typography.body, color: Colors.gray700, marginTop: 10, textAlign: "center" }}>
              You haven&apos;t joined any groups yet. Create one or accept an invitation to get started.
            </Text>
          </View>
        ) : (
          groups.map((g) => <GroupRow key={g.id} group={g} onPress={() =>
            router.push({ pathname: "/groups/group-details", params: { id: g.id, name: g.name } })
          } />)
        )}
      </ScrollView>
    </View>
  );
}

function GroupRow({ group, onPress }: { group: GroupSummary; onPress: () => void }) {
  const initial = (group.name ?? "G").trim().slice(0, 1).toUpperCase();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FFF",
        borderRadius: Layout.radii.card,
        padding: 14,
        marginBottom: 10,
      }}
    >
      {group.avatar_url ? (
        <Image source={{ uri: group.avatar_url }} style={{ width: 48, height: 48, borderRadius: 24 }} />
      ) : (
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: Colors.primaryViolet + "22",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ ...Typography.h3, color: Colors.primaryViolet }}>{initial}</Text>
        </View>
      )}

      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ ...Typography.body, fontWeight: "600", color: Colors.textPrimary }} numberOfLines={1}>
          {group.name}
        </Text>
        <Text style={{ ...Typography.caption, color: Colors.gray600, marginTop: 2 }} numberOfLines={1}>
          {group.last_message_preview
            ? group.last_message_preview
            : `${group.member_count} / ${group.max_members} members`}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
    </TouchableOpacity>
  );
}
