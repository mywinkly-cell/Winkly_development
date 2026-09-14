// apps/mobile/app/planner/invitations.tsx
// Winkly – Planner: Invitations (date/meet-up/meeting from chat)
// Actions: Decline, Accept, Propose different (reschedule); per-invitation reminder (bell).

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Alert,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Card, Header, PrimaryButton, SecondaryButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { EventReminderModal } from "@/components/planner/EventReminderModal";
import {
  getPlannerInvitationsForUser,
  acceptPlannerInvite,
  declinePlannerInvite,
  reschedulePlannerInvite,
} from "@/lib/plannerInvitations";
import type { PlannerInvitationWithItem } from "@/lib/plannerInvitations";
import { requestDateSafetyPrompt } from "@/lib/safety/dateCheckinPrompt";

const SOURCE_LABEL: Record<string, string> = {
  romance: "Date",
  friends: "Meet-up",
  business: "Meeting",
  events: "Event",
};

export default function PlannerInvitations() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
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
        const result = await acceptPlannerInvite(invitationId);
        if (result.source_mode === "romance") {
          void requestDateSafetyPrompt({
            plannerItemId: result.planner_item_id,
            partnerUserId: result.partner_user_id,
            scheduledAt: result.starts_at,
          });
        }
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
      <Header title="Invitations" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Card style={styles.card}>
          <Text style={styles.title}>Requests & RSVPs</Text>
          <Text style={styles.subtitle}>
            Accept, decline, or propose a different option. Set a reminder so you don&apos;t forget to respond.
          </Text>
        </Card>

        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginVertical: theme.spacing.xxl }} />
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
              <Card key={it.id} style={styles.itemCard}>
                <View style={styles.itemCardHeader}>
                  <Text style={styles.itemTitle}>{it.planner_item?.title ?? "Invitation"}</Text>
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setReminderForId(it.id);
                    }}
                    style={styles.bellBtn}
                    hitSlop={12}
                    accessibilityLabel="Set reminder"
                  >
                    <Ionicons name="notifications-outline" size={22} color={theme.colors.primary} />
                  </Pressable>
                </View>
                <Text style={styles.itemMeta}>{meta}</Text>
                {it.inviter?.first_name && (
                  <Text style={styles.inviter}>From {it.inviter.first_name}</Text>
                )}
                {it.status !== "pending" && (
                  <Text style={{ ...styles.statusBadge, ...(it.status === "accepted" ? styles.statusAccepted : null) }}>
                    {it.status === "accepted" ? "Accepted" : it.status === "declined" ? "Declined" : "Reschedule requested"}
                  </Text>
                )}

                {isPending && (
                  <View style={styles.rowActions}>
                    <SecondaryButton
                      title={isActing ? "…" : "Decline"}
                      onPress={() => handleDecline(it.id)}
                      disabled={isActing}
                      style={styles.rowActionBtn}
                    />
                    <SecondaryButton
                      title={isActing ? "…" : "Propose different"}
                      onPress={() => handleReschedule(it.id)}
                      disabled={isActing}
                      style={styles.rowActionBtn}
                    />
                    <PrimaryButton
                      title={isActing ? "…" : "Accept"}
                      onPress={() => handleAccept(it.id)}
                      disabled={isActing}
                      style={styles.rowActionBtn}
                    />
                  </View>
                )}
              </Card>
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

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.huge },
    card: { marginBottom: theme.spacing.md },
    title: { ...theme.type.h2, fontFamily: theme.type.h2.fontFamily, color: theme.colors.textPrimary, marginBottom: theme.spacing.xxs },
    subtitle: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary },
    empty: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, textAlign: "center", marginTop: theme.spacing.xxl },
    itemCard: { marginBottom: theme.spacing.md },
    itemCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: theme.spacing.sm },
    itemTitle: { ...theme.type.h3, fontFamily: theme.type.h3.fontFamily, color: theme.colors.textPrimary, flex: 1, paddingRight: theme.spacing.md },
    bellBtn: {
      width: 40,
      height: 40,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.primary + "15",
      alignItems: "center",
      justifyContent: "center",
    },
    itemMeta: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary },
    inviter: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary, marginTop: theme.spacing.xxs },
    statusBadge: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary, marginTop: theme.spacing.sm, fontStyle: "italic" },
    statusAccepted: { color: theme.colors.success },
    rowActions: { flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.md },
    rowActionBtn: { flex: 1 },
  });
}
