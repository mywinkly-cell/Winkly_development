import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Share,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { EventParticipantCard, type ParticipantInfo } from "@/components/ui/EventParticipantCard";
import { useFormatLocationDisplay } from "@/lib/location/useLocationDisplay";
import { EventReminderModal } from "@/components/planner/EventReminderModal";

type EventRow = {
  id: string;
  created_by?: string | null;
  title: string;
  description: string | null;
  city: string | null;
  venue_name: string | null;
  start_at: string;
  end_at: string | null;
  cover_url: string | null;
  category: string | null;
  tags: string[] | null;
  capacity: number | null;
  price_eur: number | null;
  visibility?: string | null;
  created_at?: string | null;
};

type ParticipantStatus = "going" | "interested" | "not_going" | null;

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export default function EventDetails() {
  const router = useRouter();
  const fmtLoc = useFormatLocationDisplay();
  const params = useLocalSearchParams<{ event_id?: string }>();

  const eventId = useMemo(
    () => (typeof params.event_id === "string" ? params.event_id : ""),
    [params.event_id]
  );

  const [event, setEvent] = useState<EventRow | null>(null);
  const [loading, setLoading] = useState(true);

  const [userId, setUserId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);

  const [status, setStatus] = useState<ParticipantStatus>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const [savingPlanner, setSavingPlanner] = useState(false);
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [reminderModalVisible, setReminderModalVisible] = useState(false);

  async function loadAuth() {
    const res = await supabase.auth.getUser();
    const uid = res.data.user?.id ?? null;
    setUserId(uid);
    return uid;
  }

  async function loadEvent() {
    try {
      setLoading(true);

      if (!eventId || !isUuid(eventId)) {
        setEvent(null);
        return;
      }

      const { data, error } = await supabase
        .from("events")
        .select(
          "id,created_by,title,description,city,venue_name,start_at,end_at,cover_url,category,tags,capacity,price_eur,visibility,created_at"
        )
        .eq("id", eventId)
        .maybeSingle();

      if (error || !data) {
        setEvent(null);
        return;
      }

      setEvent(data as EventRow);
    } finally {
      setLoading(false);
    }
  }

  async function loadMyStatus(uid: string | null, ev: EventRow | null) {
    if (!uid || !ev?.id) {
      setStatus(null);
      setIsHost(false);
      return;
    }

    setIsHost(ev.created_by === uid);

    const { data, error } = await supabase
      .from("event_participants")
      .select("rsvp_status")
      .eq("event_id", ev.id)
      .eq("user_id", uid)
      .maybeSingle();

    if (error || !data) {
      setStatus(null);
      return;
    }

    const s = data.rsvp_status as ParticipantStatus;
    setStatus(s);
  }

  async function loadParticipants(ev: EventRow | null) {
    if (!ev?.id) {
      setParticipants([]);
      return;
    }
    try {
      const { data: epRows } = await supabase
        .from("event_participants")
        .select("user_id")
        .eq("event_id", ev.id)
        .in("rsvp_status", ["going", "interested"]);

      const userIds = [...new Set([
        ...(epRows ?? []).map((r: { user_id: string }) => r.user_id),
        ...(ev.created_by ? [ev.created_by] : []),
      ])];

      if (userIds.length === 0) {
        setParticipants([]);
        return;
      }

      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id, first_name, birthday, city, occupation, main_photo_url, core_photos")
        .in("id", userIds);

      const byId = new Map<string, ParticipantInfo>();
      (profiles ?? []).forEach((p: any) => {
        const photo = p.main_photo_url ?? (Array.isArray(p.core_photos) ? p.core_photos[0] : null);
        byId.set(p.id, {
          id: p.id,
          firstName: p.first_name ?? "",
          photoUrl: photo,
          birthday: p.birthday,
          city: p.city,
          occupation: p.occupation,
          isOrganizer: p.id === ev.created_by,
        });
      });

      const organizerId = ev.created_by ?? null;
      if (organizerId && byId.has(organizerId)) {
        (byId.get(organizerId)!).isOrganizer = true;
      }

      const list: ParticipantInfo[] = userIds
        .filter((uid) => byId.has(uid))
        .map((uid) => byId.get(uid)!)
        .sort((a, b) => (a.isOrganizer ? -1 : b.isOrganizer ? 1 : 0));
      setParticipants(list);
    } catch {
      setParticipants([]);
    }
  }

  useEffect(() => {
    (async () => {
      const uid = await loadAuth();
      await loadEvent();

      if (eventId && isUuid(eventId)) {
        const { data } = await supabase
          .from("events")
          .select("id,created_by")
          .eq("id", eventId)
          .maybeSingle();

        if (data) {
          const ev = { ...(event ?? {}), ...data } as EventRow;
          await loadMyStatus(uid, ev);
          await loadParticipants(ev);
        } else {
          setStatus(null);
          setIsHost(false);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const refresh = async () => {
    const uid = await loadAuth();
    await loadEvent();
    await loadMyStatus(uid, event);
  };

  const joinViaRpc = async (next: Exclude<ParticipantStatus, null>) => {
    if (!event) return;

    const uid = await loadAuth();
    if (!uid) {
      Alert.alert("Join event", "Please sign in to join events.");
      return;
    }

    try {
      setStatusLoading(true);

      const { error } = await supabase.rpc("join_event", {
        p_event_id: event.id,
        p_status: next,
      });

      if (error) {
        Alert.alert("Event", error.message);
        return;
      }

      setStatus(next);

      // If user marked not_going, we keep status but access will be removed by triggers/RPC
      if (next === "going") {
        Alert.alert("You’re going!", "Chat access granted and your status was saved.");
      } else if (next === "interested") {
        Alert.alert("Saved", "Marked as interested. Chat access granted (if enabled).");
      } else {
        Alert.alert("Updated", "Marked as not going. You may lose chat access.");
      }

      // Optionally: planner auto-save when going/interested
      // (Only if you want; leave off to keep explicit button)
      // if (next === "going") await saveToPlannerSilent();

      // Optional: you can navigate to chat later using data.conversation_id
      // router.push({ pathname: "/(modes)/events/chat", params: { conversation_id: data?.conversation_id } });
    } finally {
      setStatusLoading(false);
    }
  };

  const leaveViaRpc = async () => {
    if (!event) return;

    const uid = await loadAuth();
    if (!uid) {
      Alert.alert("Leave event", "Please sign in.");
      return;
    }

    try {
      setStatusLoading(true);

      const { error } = await supabase.rpc("leave_event", { p_event_id: event.id });
      if (error) {
        Alert.alert("Leave event", error.message);
        return;
      }

      setStatus(null);
      Alert.alert("Left event", "Removed your participation and chat access.");
    } finally {
      setStatusLoading(false);
    }
  };

  const shareEvent = async () => {
    if (!event) return;
    try {
      Haptics.selectionAsync();
      const url = `https://winkly.app/events/${event.id}`;
      const cityPart = event.city ? fmtLoc(event.city) : "";
      const message = `${event.title}\n${cityPart} ${event.venue_name ?? ""}\n${formatDateTime(event.start_at)}\n\nJoin on Winkly: ${url}`;
      await Share.share({
        message,
        title: event.title,
        url: Platform.OS === "ios" ? url : undefined,
      });
    } catch (err: unknown) {
      Alert.alert("Share", (err as Error)?.message ?? "Could not share.");
    }
  };

  const saveToPlanner = async () => {
    if (!event) return;

    const uid = await loadAuth();
    if (!uid) {
      Alert.alert("Planner", "Please sign in.");
      return;
    }

    try {
      setSavingPlanner(true);

      // Requires table events_planner_items + RLS
      const { error } = await supabase.from("events_planner_items").upsert(
        { user_id: uid, event_id: event.id },
        { onConflict: "user_id,event_id" }
      );

      if (error) {
        Alert.alert("Planner", "Couldn’t save yet. Add events_planner_items table + RLS.");
        return;
      }

      Alert.alert("Saved", "Added to your events planner.");
      router.push("/(modes)/events/planner");
    } finally {
      setSavingPlanner(false);
    }
  };

  const hostHint = useMemo(() => {
    if (!event) return "";
    if (isHost) return "You are the host of this event.";
    return "";
  }, [event, isHost]);

  return (
    <View style={[styles.screen, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: Colors.card, borderColor: Colors.border }]}
          activeOpacity={0.9}
        >
          <Text style={{ color: Colors.text, fontWeight: "900" }}>‹</Text>
        </TouchableOpacity>

        <Text style={[styles.title, Typography.h2]}>Event</Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {event && (
            <TouchableOpacity
              onPress={() => { Haptics.selectionAsync(); setReminderModalVisible(true); }}
              style={[styles.headerIconBtn, { backgroundColor: Colors.card, borderColor: Colors.border }]}
              activeOpacity={0.9}
              accessibilityLabel="Set reminders"
            >
              <Ionicons name="notifications-outline" size={22} color={Colors.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => router.push("/(modes)/events/discover")}
            style={[styles.pill, { backgroundColor: Colors.card }]}
            activeOpacity={0.9}
          >
            <Text style={{ color: Colors.text, fontWeight: "800" }}>Discover</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={{ marginTop: 10, color: Colors.mutedText }}>Loading event…</Text>
          </View>
        ) : !event ? (
          <View style={[styles.empty, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
            <Text style={{ color: Colors.text, fontWeight: "900" }}>Event not found</Text>
            <Text style={{ color: Colors.mutedText, marginTop: 6, lineHeight: 18 }}>
              This usually means the `events` table isn’t ready yet or the event id is invalid.
            </Text>

            <TouchableOpacity
              onPress={() => router.push("/(modes)/events/discover")}
              style={[styles.cta, { backgroundColor: Colors.primary }]}
              activeOpacity={0.9}
            >
              <Text style={{ color: Colors.onPrimary, fontWeight: "900" }}>Back to Events</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Colors.text, fontWeight: "900", fontSize: 20 }}>{event.title}</Text>
                  <Text style={{ color: Colors.mutedText, marginTop: 8 }}>
                    {formatDateTime(event.start_at)}
                    {event.end_at ? ` – ${formatDateTime(event.end_at)}` : ""}
                  </Text>
                  <Text style={{ color: Colors.mutedText, marginTop: 6 }}>
                    {event.city ? fmtLoc(event.city) : "City"}
                    {event.venue_name ? ` · ${event.venue_name}` : ""}
                  </Text>

                  {!!hostHint && <Text style={{ color: Colors.mutedText, marginTop: 8 }}>{hostHint}</Text>}
                </View>

                <View style={{ alignItems: "flex-end" }}>
                  <View style={[styles.badge, { backgroundColor: Colors.background }]}>
                    <Text style={{ color: Colors.mutedText, fontSize: 12 }}>
                      {event.visibility ?? "public"}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: Colors.background, marginTop: 8 }]}>
                    <Text style={{ color: Colors.mutedText, fontSize: 12 }}>
                      {event.price_eur != null ? `€${event.price_eur}` : "Free"}
                    </Text>
                  </View>
                  {!!event.capacity && (
                    <View style={[styles.badge, { backgroundColor: Colors.background, marginTop: 8 }]}>
                      <Text style={{ color: Colors.mutedText, fontSize: 12 }}>{event.capacity} spots</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <View style={[styles.badge, { backgroundColor: Colors.background }]}>
                  <Text style={{ color: Colors.mutedText, fontSize: 12 }}>
                    {event.category ?? "Event"}
                  </Text>
                </View>

                {(event.tags ?? []).slice(0, 5).map((t, idx) => (
                  <View
                    key={`${t}-${idx}`}
                    style={[styles.tag, { backgroundColor: Colors.background, borderColor: Colors.border }]}
                  >
                    <Text style={{ color: Colors.text, fontWeight: "700" }}>{t}</Text>
                  </View>
                ))}
              </View>

              {!!event.description && (
                <Text style={{ color: Colors.text, marginTop: 14, lineHeight: 20 }}>
                  {event.description}
                </Text>
              )}

              {/* Who&apos;s joining — Participants & Organizer */}
              {participants.length > 0 && (
                <View style={{ marginTop: 20 }}>
                  <Text style={{ color: Colors.text, fontWeight: "900", marginBottom: 12 }}>
                    Who&apos;s joining
                  </Text>
                  {participants.map((p) => (
                    <EventParticipantCard
                      key={p.id}
                      participant={p}
                      onPress={() => router.push(`/(modes)/friends/profile-view?user_id=${p.id}`)}
                    />
                  ))}
                </View>
              )}

              {/* Status + Actions */}
              <View style={{ marginTop: 16 }}>
                <Text style={{ color: Colors.mutedText, fontWeight: "700" }}>
                  Your status:{" "}
                  <Text style={{ color: Colors.text, fontWeight: "900" }}>
                    {userId ? (status ?? "not joined") : "sign in required"}
                  </Text>
                </Text>

                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  <TouchableOpacity
                    onPress={() => joinViaRpc("going")}
                    disabled={statusLoading || !userId}
                    style={[
                      styles.primaryBtn,
                      {
                        backgroundColor: Colors.primary,
                        opacity: statusLoading || !userId ? 0.6 : 1,
                      },
                    ]}
                    activeOpacity={0.9}
                  >
                    {statusLoading && status === "going" ? (
                      <ActivityIndicator />
                    ) : (
                      <Text style={{ color: Colors.onPrimary, fontWeight: "900" }}>
                        {status === "going" ? "Going ✓" : "Join"}
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => joinViaRpc("interested")}
                    disabled={statusLoading || !userId}
                    style={[
                      styles.secondaryBtn,
                      {
                        backgroundColor: Colors.background,
                        borderColor: Colors.border,
                        opacity: statusLoading || !userId ? 0.6 : 1,
                      },
                    ]}
                    activeOpacity={0.9}
                  >
                    {statusLoading && status === "interested" ? (
                      <ActivityIndicator />
                    ) : (
                      <Text style={{ color: Colors.text, fontWeight: "900" }}>
                        {status === "interested" ? "Following ✓" : "Follow"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  <TouchableOpacity
                    onPress={shareEvent}
                    disabled={!userId}
                    style={[styles.secondaryBtn, { backgroundColor: Colors.background, borderColor: Colors.border, opacity: !userId ? 0.6 : 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }]}
                    activeOpacity={0.9}
                  >
                    <Ionicons name="share-outline" size={18} color={Colors.text} />
                    <Text style={{ color: Colors.text, fontWeight: "900" }}>Share</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  <TouchableOpacity
                    onPress={() => joinViaRpc("not_going")}
                    disabled={statusLoading || !userId}
                    style={[
                      styles.secondaryBtn,
                      {
                        backgroundColor: Colors.background,
                        borderColor: Colors.border,
                        opacity: statusLoading || !userId ? 0.6 : 1,
                      },
                    ]}
                    activeOpacity={0.9}
                  >
                    <Text style={{ color: Colors.mutedText, fontWeight: "900" }}>
                      {status === "not_going" ? "Not going ✓" : "Not going"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={leaveViaRpc}
                    disabled={statusLoading || !userId}
                    style={[
                      styles.secondaryBtn,
                      {
                        backgroundColor: Colors.background,
                        borderColor: Colors.border,
                        opacity: statusLoading || !userId ? 0.6 : 1,
                      },
                    ]}
                    activeOpacity={0.9}
                  >
                    {statusLoading && status === null ? (
                      <ActivityIndicator />
                    ) : (
                      <Text style={{ color: Colors.mutedText, fontWeight: "900" }}>Leave</Text>
                    )}
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                  <TouchableOpacity
                    onPress={saveToPlanner}
                    disabled={savingPlanner || !userId}
                    style={[
                      styles.secondaryBtn,
                      {
                        backgroundColor: Colors.background,
                        borderColor: Colors.border,
                        opacity: savingPlanner || !userId ? 0.6 : 1,
                      },
                    ]}
                    activeOpacity={0.9}
                  >
                    {savingPlanner ? (
                      <ActivityIndicator />
                    ) : (
                      <Text style={{ color: Colors.text, fontWeight: "900" }}>Save to Planner</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={refresh}
                    style={[styles.secondaryBtn, { backgroundColor: Colors.background, borderColor: Colors.border }]}
                    activeOpacity={0.9}
                  >
                    <Text style={{ color: Colors.text, fontWeight: "900" }}>Refresh</Text>
                  </TouchableOpacity>
                </View>

                <Text style={{ color: Colors.mutedText, marginTop: 10, lineHeight: 18 }}>
                  Group chat: only for public events when the host turned it on. You get access when you join or mark interested.
                </Text>
              </View>
            </View>

            <View style={[styles.block, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
              <Text style={{ color: Colors.text, fontWeight: "900" }}>Notes</Text>
              <Text style={{ color: Colors.mutedText, marginTop: 6, lineHeight: 18 }}>
                • Event group chats exist only for public events (Events mode) when the host enabled &quot;Allow a group chat&quot;.{"\n"}
                • Dates/meetings/meetups from Romance/Friends/Business chat use the original chat; no duplicate event chat.{"\n"}
                • Join/Interested uses RPC `join_event()`; chat membership is synced via triggers.
              </Text>
            </View>

            {event && (
              <EventReminderModal
                visible={reminderModalVisible}
                onClose={() => setReminderModalVisible(false)}
                itemId={event.id}
                title={event.title}
              />
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles: any = {
  screen: { flex: 1, paddingTop: Layout?.screenTopPadding ?? 16 },
  header: {
    paddingHorizontal: Layout?.screenPadding ?? 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontWeight: "900" },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },

  center: { paddingVertical: 40, alignItems: "center", justifyContent: "center" },
  empty: {
    marginHorizontal: Layout?.screenPadding ?? 16,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginTop: 8,
  },
  cta: { marginTop: 12, borderRadius: 14, paddingVertical: 12, alignItems: "center" },

  card: {
    marginHorizontal: Layout?.screenPadding ?? 16,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginTop: 8,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },

  block: {
    marginHorizontal: Layout?.screenPadding ?? 16,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginTop: 12,
  },

  primaryBtn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center" },
  secondaryBtn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center", borderWidth: 1 },
};
