// Planner — Dates (Romance): planned dates + date safety check-ins.

import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
  type LayoutChangeEvent,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";
import {
  listMyDateCheckins,
  respondDateCheckin,
  type DateSafetyCheckin,
} from "@/lib/safety/dateCheckins";
import { supabase } from "@/lib/supabase";
import { chatRoutes } from "@/lib/navigation/modeHub";
import { modeDisplayName } from "@/lib/profile/otherUserCore";

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
    const activity = (row.activity ?? row.title ?? "Date").trim();
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
        "Someone",
      ),
      partnerPhotoUrl: firstPhotoUrl(profile),
      activity,
      venue: venue || "Location TBD",
      startsAt: row.starts_at,
      status: row.status,
      conversationId: conversationMap.get(partnerId) ?? null,
      checkinId: linkedCheckin?.id ?? null,
    };
  });
}

export default function PlannerDates() {
  const router = useRouter();
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
      Alert.alert("Error", e instanceof Error ? e.message : "Could not update");
    }
  };

  const onHelp = async (id: string) => {
    Alert.alert("Safety", "If you are in immediate danger, contact local emergency services.", [
      {
        text: "Mark as needs help",
        style: "destructive",
        onPress: async () => {
          try {
            await respondDateCheckin(id, "needs_help");
            load();
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Could not update");
          }
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
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
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            activeOpacity={0.9}
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Dates</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Upcoming dates & safety</Text>
          <Text style={styles.subtitle}>
            Your confirmed plans with matches, plus safety check-ins before in-person meetups.
          </Text>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name, activity, or venue…"
            placeholderTextColor={Colors.gray500}
            style={styles.search}
          />
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={Colors.primaryViolet} />
        ) : (
          <>
            <Text style={styles.sectionTitle}>Planned dates</Text>

            {showPlannedEmpty ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={40} color={Colors.gray400} />
                <Text style={styles.emptyTitle}>No dates planned yet</Text>
                <Text style={styles.emptySubtitle}>
                  Match with someone and use the AI planner in chat to arrange your first date.
                </Text>
              </View>
            ) : showSearchEmpty ? (
              <Text style={styles.searchEmpty}>No matches for your search.</Text>
            ) : (
              filteredDates.map((date) => (
                <View key={date.id} style={styles.itemCard}>
                  <View style={styles.plannedTop}>
                    {date.partnerPhotoUrl ? (
                      <Image source={{ uri: date.partnerPhotoUrl }} style={styles.partnerAvatar} />
                    ) : (
                      <View style={[styles.partnerAvatar, styles.partnerAvatarFallback]}>
                        <Ionicons name="person" size={22} color={Colors.gray500} />
                      </View>
                    )}
                    <View style={styles.plannedBody}>
                      <Text style={styles.itemTitle}>{date.partnerName}</Text>
                      <Text style={styles.plannedActivity}>{date.activity}</Text>
                      <Text style={styles.itemSub}>{date.venue}</Text>
                      <Text style={styles.itemSub}>{formatDateTime(date.startsAt)}</Text>
                    </View>
                    <Text style={styles.badge}>{date.status}</Text>
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
                        accessibilityLabel={`Open chat with ${date.partnerName}`}
                      >
                        <Ionicons name="chatbubble-outline" size={16} color={Colors.romance.primary} />
                        <Text style={styles.linkText}>Chat</Text>
                      </TouchableOpacity>
                    ) : null}
                    {date.checkinId ? (
                      <TouchableOpacity
                        onPress={() => scrollToCheckin(date.checkinId!)}
                        style={styles.linkBtn}
                        activeOpacity={0.9}
                        accessibilityRole="button"
                        accessibilityLabel="View safety check-in"
                      >
                        <Ionicons name="shield-checkmark-outline" size={16} color={Colors.primaryViolet} />
                        <Text style={[styles.linkText, styles.linkTextViolet]}>Safety check-in</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              ))
            )}

            <Text style={styles.sectionTitle}>Safety check-ins</Text>

            {filteredCheckins.length === 0 ? (
              <Text style={styles.note}>
                {query.trim()
                  ? "No safety check-ins match your search."
                  : "No safety check-ins scheduled yet."}
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
                  style={styles.itemCard}
                  onLayout={(e: LayoutChangeEvent) => {
                    checkinOffsets.current[it.id] = e.nativeEvent.layout.y;
                  }}
                >
                  <TouchableOpacity
                    onPress={() => openCheckinChat(it)}
                    disabled={!canOpenChat}
                    activeOpacity={canOpenChat ? 0.85 : 1}
                    style={styles.checkinHeader}
                    accessibilityRole="button"
                    accessibilityLabel={
                      canOpenChat
                        ? `Open chat with ${it.partner_first_name ?? "partner"}`
                        : `Safety check-in${it.partner_first_name ? ` with ${it.partner_first_name}` : ""}`
                    }
                  >
                    {it.partner_photo_url ? (
                      <Image source={{ uri: it.partner_photo_url }} style={styles.checkinAvatar} />
                    ) : (
                      <View style={[styles.checkinAvatar, styles.partnerAvatarFallback]}>
                        <Ionicons name="person" size={18} color={Colors.gray500} />
                      </View>
                    )}
                    <View style={styles.plannedBody}>
                      <Text style={styles.itemTitle}>
                        {it.partner_first_name ?? "Safety check-in"}
                      </Text>
                      <Text style={styles.itemSub}>{formatDateTime(it.scheduled_at)}</Text>
                    </View>
                    <Text style={styles.badge}>{it.status}</Text>
                  </TouchableOpacity>
                  {it.status === "scheduled" ? (
                    <View style={styles.rowActions}>
                      <TouchableOpacity onPress={() => onOk(it.id)} style={styles.secondaryBtn} activeOpacity={0.9}>
                        <Text style={styles.secondaryText}>I&apos;m OK</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => onHelp(it.id)} style={styles.primaryBtn} activeOpacity={0.9}>
                        <Text style={styles.primaryText}>Need help</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  scroll: { padding: 16, paddingBottom: 40 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { ...Typography.headerTitle, flex: 1, textAlign: "center", color: Colors.textPrimary },
  headerSpacer: { width: 44 },
  card: {
    backgroundColor: "#FFF",
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 16,
    marginBottom: 12,
  },
  title: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 6 },
  subtitle: { ...Typography.body, color: Colors.gray700, marginBottom: 12 },
  search: {
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderRadius: Layout.radii.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.textPrimary,
  },
  sectionTitle: {
    ...Typography.caption,
    fontFamily: FontFamily.headingBold,
    fontWeight: "700",
    color: Colors.gray600,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 8,
    marginBottom: 10,
  },
  itemCard: {
    backgroundColor: "#FFF",
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 14,
    marginBottom: 10,
  },
  plannedTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  partnerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.gray200,
  },
  partnerAvatarFallback: { alignItems: "center", justifyContent: "center" },
  plannedBody: { flex: 1, minWidth: 0 },
  checkinHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  checkinAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray200,
  },
  plannedActivity: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.romance.primary,
    marginTop: 2,
  },
  itemTitle: { ...Typography.body, fontWeight: "700", color: Colors.textPrimary },
  badge: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "600", textTransform: "capitalize" },
  itemSub: { ...Typography.caption, color: Colors.gray600, marginTop: 4 },
  linkRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
  linkBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  linkText: { ...Typography.caption, fontWeight: "600", color: Colors.romance.primary },
  linkTextViolet: { color: Colors.primaryViolet },
  rowActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: Colors.gray100,
    borderRadius: 10,
  },
  secondaryText: { fontSize: 14, fontWeight: "600", color: Colors.textPrimary },
  primaryBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: Colors.errorRed + "18",
    borderRadius: 10,
  },
  primaryText: { fontSize: 14, fontWeight: "600", color: Colors.errorRed },
  emptyState: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginTop: 12,
    textAlign: "center",
  },
  emptySubtitle: {
    ...Typography.body,
    color: Colors.gray600,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 22,
  },
  searchEmpty: {
    ...Typography.caption,
    color: Colors.gray500,
    textAlign: "center",
    marginBottom: 12,
  },
  note: { ...Typography.caption, color: Colors.gray500, textAlign: "center", marginTop: 4, marginBottom: 8 },
});
