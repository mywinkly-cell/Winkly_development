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
import { useTranslation } from "react-i18next";
import { useAppTheme } from "@/constants/design-system";
import { getMyGroups, type GroupSummary } from "@/lib/groups/groupsApi";
import { getMyPendingGroupInvitations } from "@/lib/groupInvitations";
import type { Mode } from "@/types";

type GroupsMode = Mode | undefined;

export default function GroupsIndex() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const { mode } = useLocalSearchParams<{ mode?: GroupsMode }>();

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const title =
    mode === "business"
      ? t("groups.index.businessTitle")
      : mode === "friends"
        ? t("groups.index.friendsTitle")
        : t("modes.groups");
  const subtitle =
    mode === "business"
      ? t("groups.index.businessSubtitle")
      : mode === "friends"
        ? t("groups.index.friendsSubtitle")
        : t("groups.index.subtitle");

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
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ padding: 20, paddingBottom: 12 }}>
        <Text style={{ ...theme.type.h1, color: theme.colors.textPrimary }}>{title}</Text>
        <Text style={{ ...theme.type.body, color: theme.colors.textSecondary, marginTop: 6 }}>{subtitle}</Text>
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
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: "/groups/plan-together",
              params: { mode: mode === "business" ? "business" : "friends" },
            })
          }
          style={{
            borderRadius: theme.radii.lg,
            padding: 16,
            marginBottom: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            backgroundColor: theme.colors.primary,
          }}
          activeOpacity={0.9}
          accessibilityLabel={t("groups.index.planA11y")}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: theme.colors.onPrimary + "2E",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="sparkles" size={20} color={theme.colors.onPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ ...theme.type.button, color: theme.colors.onPrimary }}>{t("groups.index.planTitle")}</Text>
            <Text style={{ ...theme.type.caption, color: theme.colors.onPrimary + "D9", marginTop: 2 }}>
              {t("groups.index.planSubtitle")}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.onPrimary + "D9"} />
        </TouchableOpacity>

        <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
          <TouchableOpacity
            onPress={() => router.push({ pathname: "/groups/create-group", params: { mode } })}
            style={{
              flex: 1,
              borderRadius: theme.radii.md,
              paddingVertical: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor: theme.colors.backgroundMuted,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
            activeOpacity={0.9}
          >
            <Ionicons name="add" size={18} color={theme.colors.textPrimary} />
            <Text style={{ ...theme.type.button, color: theme.colors.textPrimary, flexShrink: 1, textAlign: "center" }}>{t("groups.index.create")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/groups/invitations")}
            style={{
              borderRadius: theme.radii.md,
              paddingVertical: 12,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: theme.colors.backgroundMuted,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
            activeOpacity={0.9}
            accessibilityLabel={t("chat.start.groupInvitations")}
          >
            <Ionicons name="mail-outline" size={18} color={theme.colors.textPrimary} />
            <Text style={{ ...theme.type.button, color: theme.colors.textPrimary, flexShrink: 1 }}>{t("groups.index.invites")}</Text>
            {pendingCount > 0 ? (
              <View
                style={{
                  minWidth: 20,
                  height: 20,
                  borderRadius: 10,
                  paddingHorizontal: 5,
                  backgroundColor: theme.colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: theme.colors.onPrimary, fontSize: 12, fontWeight: "700" }}>{pendingCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        <Text style={{ ...theme.type.h3, color: theme.colors.textPrimary, marginBottom: 10 }}>{t("groups.index.yourGroups")}</Text>

        {loading ? (
          <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginTop: 24 }} />
        ) : groups.length === 0 ? (
          <View
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radii.lg,
              padding: 20,
              alignItems: "center",
            }}
          >
            <Ionicons name="people-outline" size={36} color={theme.colors.textMuted} />
            <Text style={{ ...theme.type.body, color: theme.colors.textSecondary, marginTop: 10, textAlign: "center" }}>
              {t("groups.index.empty")}
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
  const { t } = useTranslation();
  const theme = useAppTheme();
  const initial = (group.name ?? "G").trim().slice(0, 1).toUpperCase();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
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
            backgroundColor: theme.colors.primary + "22",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ ...theme.type.h3, color: theme.colors.primary }}>{initial}</Text>
        </View>
      )}

      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ ...theme.type.body, fontWeight: "600", color: theme.colors.textPrimary }} numberOfLines={1}>
          {group.name}
        </Text>
        <Text style={{ ...theme.type.caption, color: theme.colors.textSecondary, marginTop: 2 }} numberOfLines={1}>
          {group.last_message_preview
            ? group.last_message_preview
            : t("groups.memberCount", { count: group.member_count, max: group.max_members })}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
    </TouchableOpacity>
  );
}
