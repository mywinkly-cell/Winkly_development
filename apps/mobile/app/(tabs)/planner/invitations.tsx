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
import { useTranslation } from "react-i18next";
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
import { useAppLocaleTag } from "@/lib/i18n/appLocale";

const SOURCE_LABEL_KEYS: Record<string, string> = {
  romance: "planner.source.romance",
  friends: "planner.source.friends",
  business: "planner.source.business",
  events: "planner.source.events",
};

export default function PlannerInvitations() {
  const router = useRouter();
  const { t } = useTranslation();
  const appLocale = useAppLocaleTag();
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
        Alert.alert(t("common.error"), (e as Error).message ?? t("planner.invites.acceptFailed"));
      } finally {
        setActingId(null);
      }
    },
    [load, t]
  );

  const handleDecline = useCallback(
    async (invitationId: string) => {
      Alert.alert(t("planner.invites.declineTitle"), t("planner.invites.declineMessage"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("planner.decline"),
          style: "destructive",
          onPress: async () => {
            setActingId(invitationId);
            try {
              await declinePlannerInvite(invitationId);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await load();
            } catch (e) {
              Alert.alert(t("common.error"), (e as Error).message ?? t("planner.invites.declineFailed"));
            } finally {
              setActingId(null);
            }
          },
        },
      ]);
    },
    [load, t]
  );

  const handleReschedule = useCallback(
    async (invitationId: string) => {
      setActingId(invitationId);
      try {
        await reschedulePlannerInvite(invitationId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(t("planner.proposeDifferent"), t("planner.invites.rescheduleSent"), [{ text: t("common.ok") }]);
        await load();
      } catch (e) {
        Alert.alert(t("common.error"), (e as Error).message ?? t("planner.couldNotUpdate"));
      } finally {
        setActingId(null);
      }
    },
    [load, t]
  );

  const reminderInvite = reminderForId ? items.find((i) => i.id === reminderForId) : null;
  const pendingFirst = [...items].sort((a, b) => (a.status === "pending" ? -1 : b.status === "pending" ? 1 : 0));

  return (
    <View style={styles.screen}>
      <Header title={t("planner.invitations")} onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Card style={styles.card}>
          <Text style={styles.title}>{t("planner.invites.title")}</Text>
          <Text style={styles.subtitle}>{t("planner.invites.subtitle")}</Text>
        </Card>

        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginVertical: theme.spacing.xxl }} />
        ) : pendingFirst.length === 0 ? (
          <Text style={styles.empty}>{t("planner.invites.empty")}</Text>
        ) : (
          pendingFirst.map((it) => {
            const meta = [
              SOURCE_LABEL_KEYS[it.planner_item?.source_mode ?? ""]
                ? t(SOURCE_LABEL_KEYS[it.planner_item?.source_mode ?? ""])
                : it.planner_item?.source_mode,
              it.planner_item?.starts_at
                ? new Date(it.planner_item.starts_at).toLocaleString(appLocale, {
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
                  <Text style={styles.itemTitle}>{it.planner_item?.title ?? t("planner.invites.fallbackTitle")}</Text>
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setReminderForId(it.id);
                    }}
                    style={styles.bellBtn}
                    hitSlop={12}
                    accessibilityLabel={t("planner.invites.setReminder")}
                  >
                    <Ionicons name="notifications-outline" size={22} color={theme.colors.primary} />
                  </Pressable>
                </View>
                <Text style={styles.itemMeta}>{meta}</Text>
                {it.inviter?.first_name && (
                  <Text style={styles.inviter}>{t("planner.invites.from", { name: it.inviter.first_name })}</Text>
                )}
                {it.status !== "pending" && (
                  <Text style={{ ...styles.statusBadge, ...(it.status === "accepted" ? styles.statusAccepted : null) }}>
                    {it.status === "accepted"
                      ? t("planner.invites.statusAccepted")
                      : it.status === "declined"
                        ? t("planner.invites.statusDeclined")
                        : t("planner.invites.statusReschedule")}
                  </Text>
                )}

                {isPending && (
                  <View style={styles.rowActions}>
                    <SecondaryButton
                      title={isActing ? "…" : t("planner.decline")}
                      onPress={() => handleDecline(it.id)}
                      disabled={isActing}
                      style={styles.rowActionBtn}
                    />
                    <SecondaryButton
                      title={isActing ? "…" : t("planner.proposeDifferent")}
                      onPress={() => handleReschedule(it.id)}
                      disabled={isActing}
                      style={styles.rowActionBtn}
                    />
                    <PrimaryButton
                      title={isActing ? "…" : t("planner.accept")}
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
          subtitle={t("planner.remindMeToRespond")}
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
    rowActionBtn: { flex: 1, paddingHorizontal: theme.spacing.sm },
  });
}
