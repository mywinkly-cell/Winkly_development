// Planner — Dates (Romance): planned dates + date safety check-ins.

import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
  type LayoutChangeEvent,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { Ionicons } from "@expo/vector-icons";
import { Card, Header, Input, PrimaryButton, SecondaryButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import {
  listMyDateCheckins,
  respondDateCheckin,
  type DateSafetyCheckin,
} from "@/lib/safety/dateCheckins";
import { supabase } from "@/lib/supabase";
import { chatRoutes } from "@/lib/navigation/modeHub";
import { modeDisplayName } from "@/lib/profile/otherUserCore";
import { useAppLocaleTag } from "@/lib/i18n/appLocale";

const RECENT_PAST_MS = 7 * 24 * 60 * 60 * 1000;

type PlannedDateRow = {
  id: string;
  proposer_id: string;
  invitee_id: string;
  title: string;
  starts_at: string;
  activity: string | null;
  location: string | null;
  place: string | null;
  status: string;
};

type PlannedDate = {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerPhotoUrl: string | null;
  activity: string;
  venue: string;
  startsAt: string;
  status: string;
  conversationId: string | null;
  checkinId: string | null;
};

function firstPhotoUrl(row: Record<string, unknown> | undefined): string | null {
  if (!row) return null;
  const romance = (row.romance_photos as (string | null)[] | null)?.find((p) => !!p);
  if (romance) return romance;
  const core = (row.core_photos as (string | null)[] | null)?.find((p) => !!p);
  if (core) return core;
  return (row.main_photo_url as string | null) ?? null;
}

async function buildRomanceConversationMap(userId: string): Promise<Map<string, string>> {
  const { data: memberships } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", userId)
    .is("left_at", null);

  const convIds = [...new Set((memberships ?? []).map((m) => m.conversation_id as string))];
  if (!convIds.length) return new Map();

  const { data: convs } = await supabase
    .from("conversations")
    .select("id")
    .in("id", convIds)
    .eq("mode", "romance");

  const romanceConvIds = (convs ?? []).map((c) => c.id as string);
  if (!romanceConvIds.length) return new Map();

  const { data: members } = await supabase
    .from("conversation_members")
    .select("conversation_id, user_id")
    .in("conversation_id", romanceConvIds)
    .is("left_at", null);

  const map = new Map<string, string>();
  for (const convId of romanceConvIds) {
    const convMembers = (members ?? []).filter((m) => m.conversation_id === convId);
    const partner = convMembers.find((m) => m.user_id !== userId);
    if (partner?.user_id) map.set(partner.user_id as string, convId);
  }
  return map;
}

async function loadPlannedDates(
  userId: string,
  checkinByPlannerItem: Map<string, DateSafetyCheckin>,
  conversationMap: Map<string, string>,
): Promise<PlannedDate[]> {
  const cutoff = new Date(Date.now() - RECENT_PAST_MS).toISOString();
  const { data, error } = await supabase
    .from("dates")
    .select("id, proposer_id, invitee_id, title, starts_at, activity, location, place, status")
    .gte("starts_at", cutoff)
    .neq("status", "declined")
    .order("starts_at", { ascending: true });

  if (error) {
    console.warn("PlannerDates planned dates load", error);
    return [];
  }

  const rows = (data ?? []) as PlannedDateRow[];
  if (!rows.length) return [];

  const partnerIds = [
    ...new Set(rows.map((r) => (r.proposer_id === userId ? r.invitee_id : r.proposer_id))),
  ];

  const [profilesRes] = await Promise.all([
    supabase
      .from("public_profile_view")
      .select("id, first_name, last_name, show_full_name, romance_photos, core_photos, main_photo_url")
      .in("id", partnerIds),
  ]);

  const profileById = new Map<string, Record<string, unknown>>();
  (profilesRes.data ?? []).forEach((row) => {
    profileById.set(row.id as string, row as Record<string, unknown>);
  });

  return rows.map((row) => {
    const partnerId = row.proposer_id === userId ? row.invitee_id : row.proposer_id;
    const profile = profileById.get(partnerId);
    const activity = (row.activity ?? row.title ?? i18n.t("planner.datesScreen.fallbackActivity")).trim();
    const venue = (row.place ?? row.location ?? row.title ?? "").trim();
    const linkedCheckin = checkinByPlannerItem.get(row.id);

    return {
      id: row.id,
      partnerId,
      partnerName: modeDisplayName(
        {
          first_name: profile?.first_name as string | null | undefined,
          last_name: profile?.last_name as string | null | undefined,
          show_full_name: profile?.show_full_name as boolean | null | undefined,
        },
        "romance",
        i18n.t("planner.datesScreen.fallbackName"),
      ),
      partnerPhotoUrl: firstPhotoUrl(profile),
      activity,
      venue: venue || i18n.t("planner.datesScreen.locationTbd"),
      startsAt: row.starts_at,
      status: row.status,
      conversationId: conversationMap.get(partnerId) ?? null,
      checkinId: linkedCheckin?.id ?? null,
    };
  });
}

export default function PlannerDates() {
  const router = useRouter();
  const { t } = useTranslation();
  const appLocale = useAppLocaleTag();
  const statusLabel = (status: string) => t(`planner.status.${status}`, { defaultValue: status });
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const scrollRef = useRef<ScrollView>(null);
  const checkinOffsets = useRef<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkins, setCheckins] = useState<DateSafetyCheckin[]>([]);
  const [plannedDates, setPlannedDates] = useState<PlannedDate[]>([]);
  const [conversationByPartnerId, setConversationByPartnerId] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        setCheckins([]);
        setPlannedDates([]);
        setConversationByPartnerId({});
        return;
      }

      const [rows, conversationMap] = await Promise.all([
        listMyDateCheckins(),
        buildRomanceConversationMap(uid),
      ]);
      setCheckins(rows);
      setConversationByPartnerId(Object.fromEntries(conversationMap));

      const checkinByPlannerItem = new Map<string, DateSafetyCheckin>();
      for (const row of rows) {
        if (row.planner_item_id) checkinByPlannerItem.set(row.planner_item_id, row);
      }

      const dates = await loadPlannedDates(uid, checkinByPlannerItem, conversationMap);
      setPlannedDates(dates);
    } catch (e) {
      console.warn("PlannerDates load", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  const filteredDates = plannedDates.filter((date) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      date.partnerName.toLowerCase().includes(q) ||
      date.activity.toLowerCase().includes(q) ||
      date.venue.toLowerCase().includes(q)
    );
  });

  const filteredCheckins = checkins.filter((checkin) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const linked = plannedDates.find((d) => d.id === checkin.planner_item_id);
    if (linked) {
      return (
        linked.partnerName.toLowerCase().includes(q) ||
        linked.activity.toLowerCase().includes(q) ||
        linked.venue.toLowerCase().includes(q)
      );
    }
    if (checkin.partner_user_id) {
      const name = checkin.partner_first_name ?? "";
      return name.toLowerCase().includes(q);
    }
    return false;
  });

  const openCheckinChat = (checkin: DateSafetyCheckin) => {
    if (!checkin.partner_user_id) return;
    const conversationId = conversationByPartnerId[checkin.partner_user_id];
    if (!conversationId) return;
    router.push(
      chatRoutes.conversation("romance", conversationId) as Parameters<typeof router.push>[0],
    );
  };

  const scrollToCheckin = (checkinId: string) => {
    const y = checkinOffsets.current[checkinId];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  };

  const onOk = async (id: string) => {
    try {
      await respondDateCheckin(id, "ok");
      load();
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : t("planner.couldNotUpdate"));
    }
  };

  const onHelp = async (id: string) => {
    Alert.alert(t("planner.datesScreen.safetyTitle"), t("planner.datesScreen.safetyMessage"), [
      {
        text: t("planner.datesScreen.markNeedsHelp"),
        style: "destructive",
        onPress: async () => {
          try {
            await respondDateCheckin(id, "needs_help");
            load();
          } catch (e) {
            Alert.alert(t("common.error"), e instanceof Error ? e.message : t("planner.couldNotUpdate"));
          }
        },
      },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  };

  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString(appLocale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const showPlannedEmpty = !loading && filteredDates.length === 0 && !query.trim();
  const showSearchEmpty = !loading && query.trim() && filteredDates.length === 0 && filteredCheckins.length === 0;

  return (
    <View style={styles.screen}>
      <Header title={t("planner.dates")} onBack={() => router.back()} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
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
        <Card style={styles.card}>
          <Text style={styles.title}>{t("planner.datesScreen.title")}</Text>
          <Text style={styles.subtitle}>{t("planner.datesScreen.subtitle")}</Text>

          <Input
            value={query}
            onChangeText={setQuery}
            placeholder={t("planner.datesScreen.searchPlaceholder")}
            containerStyle={styles.searchContainer}
          />
        </Card>

        {loading ? (
          <ActivityIndicator style={{ marginTop: theme.spacing.xxl }} color={theme.colors.primary} />
        ) : (
          <>
            <Text style={styles.sectionTitle}>{t("planner.datesScreen.confirmedTitle")}</Text>
            <Text style={styles.sectionHint}>{t("planner.datesScreen.confirmedHint")}</Text>

            {showPlannedEmpty ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={40} color={theme.colors.textMuted} />
                <Text style={styles.emptyTitle}>{t("planner.datesScreen.emptyTitle")}</Text>
                <Text style={styles.emptySubtitle}>{t("planner.datesScreen.emptySubtitle")}</Text>
              </View>
            ) : showSearchEmpty ? (
              <Text style={styles.searchEmpty}>{t("planner.datesScreen.searchEmpty")}</Text>
            ) : (
              filteredDates.map((date) => (
                <Card key={date.id} style={styles.itemCard}>
                  <View style={styles.plannedTop}>
                    {date.partnerPhotoUrl ? (
                      <Image source={{ uri: date.partnerPhotoUrl }} style={styles.partnerAvatar} />
                    ) : (
                      <View style={[styles.partnerAvatar, styles.partnerAvatarFallback]}>
                        <Ionicons name="person" size={22} color={theme.colors.textMuted} />
                      </View>
                    )}
                    <View style={styles.plannedBody}>
                      <Text style={styles.itemTitle}>{date.partnerName}</Text>
                      <Text style={styles.plannedActivity}>{date.activity}</Text>
                      <Text style={styles.itemSub}>{date.venue}</Text>
                      <Text style={styles.itemSub}>{formatDateTime(date.startsAt)}</Text>
                    </View>
                    <Text style={styles.badge}>{statusLabel(date.status)}</Text>
                  </View>

                  <View style={styles.linkRow}>
                    {date.conversationId ? (
                      <TouchableOpacity
                        onPress={() =>
                          router.push(
                            chatRoutes.conversation("romance", date.conversationId!) as Parameters<
                              typeof router.push
                            >[0],
                          )
                        }
                        style={styles.linkBtn}
                        activeOpacity={0.9}
                        accessibilityRole="button"
                        accessibilityLabel={t("planner.datesScreen.openChatWith", { name: date.partnerName })}
                      >
                        <Ionicons name="chatbubble-outline" size={16} color={theme.modeAccent("romance").primary} />
                        <Text style={styles.linkText}>{t("planner.datesScreen.chat")}</Text>
                      </TouchableOpacity>
                    ) : null}
                    {date.checkinId ? (
                      <TouchableOpacity
                        onPress={() => scrollToCheckin(date.checkinId!)}
                        style={styles.linkBtn}
                        activeOpacity={0.9}
                        accessibilityRole="button"
                        accessibilityLabel={t("planner.datesScreen.viewCheckin")}
                      >
                        <Ionicons name="shield-checkmark-outline" size={16} color={theme.colors.primary} />
                        <Text style={{ ...styles.linkText, color: theme.colors.primary }}>{t("planner.datesScreen.checkin")}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </Card>
              ))
            )}

            <Text style={styles.sectionTitle}>{t("planner.datesScreen.checkinsTitle")}</Text>

            {filteredCheckins.length === 0 ? (
              <Text style={styles.note}>
                {query.trim()
                  ? t("planner.datesScreen.checkinsSearchEmpty")
                  : t("planner.datesScreen.checkinsEmpty")}
              </Text>
            ) : (
              filteredCheckins.map((it) => {
                const checkinChatId = it.partner_user_id
                  ? conversationByPartnerId[it.partner_user_id]
                  : undefined;
                const canOpenChat = !!checkinChatId;

                return (
                <View
                  key={it.id}
                  onLayout={(e: LayoutChangeEvent) => {
                    checkinOffsets.current[it.id] = e.nativeEvent.layout.y;
                  }}
                >
                <Card style={styles.itemCard}>
                  <TouchableOpacity
                    onPress={() => openCheckinChat(it)}
                    disabled={!canOpenChat}
                    activeOpacity={canOpenChat ? 0.85 : 1}
                    style={styles.checkinHeader}
                    accessibilityRole="button"
                    accessibilityLabel={
                      canOpenChat
                        ? it.partner_first_name
                          ? t("planner.datesScreen.openChatWith", { name: it.partner_first_name })
                          : t("planner.datesScreen.openChat")
                        : it.partner_first_name
                          ? t("planner.datesScreen.checkinWith", { name: it.partner_first_name })
                          : t("planner.datesScreen.checkin")
                    }
                  >
                    {it.partner_photo_url ? (
                      <Image source={{ uri: it.partner_photo_url }} style={styles.checkinAvatar} />
                    ) : (
                      <View style={[styles.checkinAvatar, styles.partnerAvatarFallback]}>
                        <Ionicons name="person" size={18} color={theme.colors.textMuted} />
                      </View>
                    )}
                    <View style={styles.plannedBody}>
                      <Text style={styles.itemTitle}>
                        {it.partner_first_name ?? t("planner.datesScreen.checkin")}
                      </Text>
                      <Text style={styles.itemSub}>{formatDateTime(it.scheduled_at)}</Text>
                    </View>
                    <Text style={styles.badge}>{statusLabel(it.status)}</Text>
                  </TouchableOpacity>
                  {it.status === "scheduled" ? (
                    <View style={styles.rowActions}>
                      <SecondaryButton title={t("planner.datesScreen.imOk")} onPress={() => onOk(it.id)} style={styles.rowActionBtn} />
                      <PrimaryButton
                        title={t("planner.datesScreen.needHelp")}
                        onPress={() => onHelp(it.id)}
                        style={{ ...styles.rowActionBtn, backgroundColor: theme.colors.errorBg }}
                        textStyle={{ color: theme.colors.error }}
                      />
                    </View>
                  ) : null}
                </Card>
                </View>
              );
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    scroll: { padding: theme.spacing.lg, paddingBottom: theme.spacing.huge },
    card: { marginBottom: theme.spacing.md },
    title: { ...theme.type.h2, fontFamily: theme.type.h2.fontFamily, color: theme.colors.textPrimary, marginBottom: theme.spacing.xxs },
    subtitle: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, marginBottom: theme.spacing.md },
    searchContainer: { marginBottom: 0 },
    sectionTitle: {
      ...theme.type.overline,
      fontFamily: theme.type.overline.fontFamily,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.sm,
      marginBottom: theme.spacing.xxs,
    },
    sectionHint: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textMuted,
      marginBottom: theme.spacing.md,
    },
    itemCard: { marginBottom: theme.spacing.sm },
    plannedTop: { flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.md },
    partnerAvatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: theme.colors.border,
    },
    partnerAvatarFallback: { alignItems: "center", justifyContent: "center" },
    plannedBody: { flex: 1, minWidth: 0 },
    checkinHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.md,
    },
    checkinAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors.border,
    },
    plannedActivity: {
      ...theme.type.bodyMedium,
      fontFamily: theme.type.bodyMedium.fontFamily,
      color: theme.modeAccent("romance").primary,
      marginTop: 2,
    },
    itemTitle: { ...theme.type.bodyMedium, fontFamily: theme.type.bodyMedium.fontFamily, fontWeight: "700", color: theme.colors.textPrimary },
    badge: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.primary, fontWeight: "600", textTransform: "capitalize" },
    itemSub: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary, marginTop: theme.spacing.xxs },
    linkRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md, marginTop: theme.spacing.md },
    linkBtn: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
    linkText: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, fontWeight: "600", color: theme.modeAccent("romance").primary },
    rowActions: { flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.md },
    rowActionBtn: { flex: 1 },
    emptyState: {
      alignItems: "center",
      paddingVertical: theme.spacing.xxl,
      paddingHorizontal: theme.spacing.xl,
      marginBottom: theme.spacing.sm,
    },
    emptyTitle: {
      ...theme.type.h3,
      fontFamily: theme.type.h3.fontFamily,
      color: theme.colors.textPrimary,
      marginTop: theme.spacing.md,
      textAlign: "center",
    },
    emptySubtitle: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.sm,
      textAlign: "center",
    },
    searchEmpty: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textMuted,
      textAlign: "center",
      marginBottom: theme.spacing.md,
    },
    note: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textMuted, textAlign: "center", marginTop: theme.spacing.xxs, marginBottom: theme.spacing.sm },
  });
}
