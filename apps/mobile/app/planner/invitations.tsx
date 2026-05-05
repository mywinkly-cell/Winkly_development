// apps/mobile/app/planner/invitations.tsx
// Winkly – Planner: Invitations (date/meet-up/meeting from chat)
// Actions: Decline, Accept, Propose different (reschedule); per-invitation reminder (bell).

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { EventReminderModal } from "@/components/planner/EventReminderModal";
import {
  getPlannerInvitationsForUser,
  acceptPlannerInvite,
  declinePlannerInvite,
  reschedulePlannerInvite,
} from "@/lib/plannerInvitations";
import type { PlannerInvitationWithItem } from "@/lib/plannerInvitations";

const SOURCE_LABEL: Record<string, string> = {
  romance: "Date",
  friends: "Meet-up",
  business: "Meeting",
  events: "Event",
};

export default function PlannerInvitations() {
  const router = useRouter();
  const [reminderForId, setReminderForId] = useState<string | null>(null);
  const [items, setItems] = useState<PlannerInvitationWithItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await getPlannerInvitationsForUser();
    setItems(list);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const handleAccept = useCallback(
    async (invitationId: string) => {
      setActingId(invitationId);
      try {
        await acceptPlannerInvite(invitationId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await load();
      } catch (e) {
        Alert.alert("Error", (e as Error).message ?? "Could not accept.");
      } finally {
        setActingId(null);
      }
    },
    [load]
  );

  const handleDecline = useCallback(
    async (invitationId: string) => {
      Alert.alert("Decline invitation?", "The sender will be notified.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: async () => {
            setActingId(invitationId);
            try {
              await declinePlannerInvite(invitationId);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await load();
            } catch (e) {
              Alert.alert("Error", (e as Error).message ?? "Could not decline.");
            } finally {
              setActingId(null);
            }
          },
        },
      ]);
    },
    [load]
  );

  const handleReschedule = useCallback(
    async (invitationId: string) => {
      setActingId(invitationId);
      try {
        await reschedulePlannerInvite(invitationId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          "Propose different",
          "You asked to reschedule. You can suggest another time or place in the chat.",
          [{ text: "OK" }]
        );
        await load();
      } catch (e) {
        Alert.alert("Error", (e as Error).message ?? "Could not update.");
      } finally {
        setActingId(null);
      }
    },
    [load]
  );

  const reminderInvite = reminderForId ? items.find((i) => i.id === reminderForId) : null;
  const pendingFirst = [...items].sort((a, b) => (a.status === "pending" ? -1 : b.status === "pending" ? 1 : 0));

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Invitations</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Requests & RSVPs</Text>
          <Text style={styles.subtitle}>
            Accept, decline, or propose a different option. Set a reminder so you don&apos;t forget to respond.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginVertical: 24 }} />
        ) : pendingFirst.length === 0 ? (
          <Text style={styles.empty}>No invitations yet.</Text>
        ) : (
          pendingFirst.map((it) => {
            const meta = [
              SOURCE_LABEL[it.planner_item?.source_mode ?? ""] ?? it.planner_item?.source_mode,
              it.planner_item?.starts_at
                ? new Date(it.planner_item.starts_at).toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "",
            ]
              .filter(Boolean)
              .join(" • ");
            const isPending = it.status === "pending";
            const isActing = actingId === it.id;

            return (
              <View key={it.id} style={styles.itemCard}>
                <View style={styles.itemCardHeader}>
                  <Text style={styles.itemTitle}>{it.planner_item?.title ?? "Invitation"}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.selectionAsync();
                      setReminderForId(it.id);
                    }}
                    style={styles.bellBtn}
                    hitSlop={12}
                    accessibilityLabel="Set reminder"
                  >
                    <Ionicons name="notifications-outline" size={22} color={Colors.primaryViolet} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.itemMeta}>{meta}</Text>
                {it.inviter?.first_name && (
                  <Text style={styles.inviter}>From {it.inviter.first_name}</Text>
                )}
                {it.status !== "pending" && (
                  <Text style={[styles.statusBadge, it.status === "accepted" && styles.statusAccepted]}>
                    {it.status === "accepted" ? "Accepted" : it.status === "declined" ? "Declined" : "Reschedule requested"}
                  </Text>
                )}

                {isPending && (
                  <View style={styles.rowActions}>
                    <TouchableOpacity
                      onPress={() => handleDecline(it.id)}
                      disabled={isActing}
                      style={styles.secondaryBtn}
                      activeOpacity={0.9}
                    >
                      <Text style={styles.secondaryText}>{isActing ? "…" : "Decline"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleReschedule(it.id)}
                      disabled={isActing}
                      style={styles.secondaryBtn}
                      activeOpacity={0.9}
                    >
                      <Text style={styles.secondaryText}>{isActing ? "…" : "Propose different"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleAccept(it.id)}
                      disabled={isActing}
                      style={styles.primaryBtn}
                      activeOpacity={0.9}
                    >
                      <Text style={styles.primaryText}>{isActing ? "…" : "Accept"}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {reminderInvite && (
        <EventReminderModal
          visible={!!reminderForId}
          onClose={() => setReminderForId(null)}
          itemId={reminderInvite.id}
          title={reminderInvite.planner_item?.title ?? reminderInvite.id}
          subtitle="Remind me to respond"
        />
      )}
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

  card: {
    backgroundColor: "#FFF",
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 16,
    marginBottom: 12,
  },
  title: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 6 },
  subtitle: { ...Typography.body, color: Colors.gray700 },

  empty: { ...Typography.body, color: Colors.gray600, textAlign: "center", marginTop: 24 },

  itemCard: {
    backgroundColor: "#FFF",
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 16,
    marginBottom: 12,
  },
  itemCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  itemTitle: { ...Typography.h3, color: Colors.textPrimary, flex: 1, paddingRight: 12 },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryViolet + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  itemMeta: { ...Typography.body, color: Colors.gray700 },
  inviter: { ...Typography.caption, color: Colors.gray600, marginTop: 2 },
  statusBadge: { ...Typography.caption, color: Colors.gray600, marginTop: 6, fontStyle: "italic" },
  statusAccepted: { color: Colors.successGreen },

  rowActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  primaryBtn: {
    flex: 1,
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryText: { ...Typography.button, color: Colors.accentYellow },
  secondaryBtn: {
    flex: 1,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryText: { ...Typography.button, color: Colors.textPrimary },
});
