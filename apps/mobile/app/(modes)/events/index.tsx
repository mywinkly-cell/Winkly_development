// ────────────────────────────────────────────────
// Winkly Events Mode – Home Screen
// Discover: filter by day/week/month + category; Winkly events + external (Ticketmaster, Meetup, Eventbrite).
// Category strips: Music & Dancing, Nightlife, Performing Arts, Dating & Networking, Hobbies, Business, Food & Drink.
// See docs/EXTERNAL_EVENTS_AND_FILTERING.md
// ────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ModeHeader } from "@/components/layout/ModeHeader";
import { EventsBottomNav } from "@/components/layout/EventsBottomNav";
import { EventCard, type EventCardItem } from "@/components/ui/EventCard";
import { Card, Chip, PrimaryButton, TextButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { EVENT_CATEGORIES, type EventCategoryId, type EventTimeRange } from "@/constants/eventCategories";
import { addWinklyEventToPlanner } from "@/lib/access/events";
import { addExternalEventToPlanner, fetchNearbyExternalEvents, type ExternalEventsStatus } from "@/lib/externalEvents";
import { getDeviceCoordsIfPermitted } from "@/lib/location/deviceLocation";
import { supabase } from "@/lib/supabase";
import { useSafeAreaInsets } from "@/lib/useSafeAreaInsets";
import { PlanItBar } from "@/components/ai/PlanItBar";
import { PLAN_IT_ENTRY_ENABLED } from "@/config/flags";

// Map DB event row to EventCardItem (canonical starts_at / ends_at)
function winklyRowToCard(row: Record<string, unknown>): EventCardItem {
  const startAt = row.starts_at as string;
  const endAt = row.ends_at as string | null;
  const imageUrl = (row.cover_url ?? row.cover_image_uri) as string | null;
  return {
    id: row.id as string,
    title: (row.title as string) ?? "",
    description: (row.description as string) ?? null,
    imageUrl: imageUrl ?? null,
    startAt: startAt ?? new Date().toISOString(),
    endAt: endAt ?? null,
    location: (row.city ?? row.location) as string | null,
    venueName: (row.venue_name as string) ?? null,
    hostName: null,
    category: (row.category as string) ?? null,
    winklyEventId: row.id as string,
  };
}

function getRangeBounds(range: EventTimeRange, date: Date): { from: string; to: string } {
  const from = new Date(date);
  const to = new Date(date);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  if (range === "day") {
    return { from: from.toISOString(), to: to.toISOString() };
  }
  if (range === "week") {
    const day = from.getDay();
    const start = new Date(from);
    start.setDate(from.getDate() - day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  // month
  from.setDate(1);
  to.setMonth(from.getMonth() + 1);
  to.setDate(0);
  to.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function EventsHome() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  useSafeAreaInsets(); // reserve safe area; values not needed in this screen

  const [timeRange, setTimeRange] = useState<EventTimeRange>("week");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [category, setCategory] = useState<EventCategoryId | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [winklyEvents, setWinklyEvents] = useState<EventCardItem[]>([]);
  const [externalEvents, setExternalEvents] = useState<EventCardItem[]>([]);
  const [externalStatus, setExternalStatus] = useState<ExternalEventsStatus | "loading">("loading");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { from, to } = useMemo(() => getRangeBounds(timeRange, selectedDate), [timeRange, selectedDate]);

  // Winkly-native events. Always best-effort; failures leave the list empty but never throw,
  // so the screen still renders (no blank screen on a Supabase error).
  const fetchEvents = useCallback(async (reset?: boolean) => {
    if (reset) setLoading(true);
    try {
      const col = "starts_at";
      let query = supabase
        .from("events")
        .select("*")
        .gte(col, from)
        .lte(col, to)
        .order(col, { ascending: true })
        .limit(80);
      if (category) query = query.eq("category", category);
      const { data, error } = await query;
      const rows = (error ? [] : data ?? []) as Record<string, unknown>[];
      setWinklyEvents(rows.map(winklyRowToCard));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [from, to, category]);

  // External events (Ticketmaster / Meetup / Eventbrite) via Edge Function. Best-effort only:
  // needs device location (no prompt) and degrades to Winkly-only if APIs are unavailable.
  const fetchExternalEvents = useCallback(async () => {
    setExternalStatus("loading");
    const coords = await getDeviceCoordsIfPermitted();
    if (!coords) {
      // No location available — we can't query nearby external events. Fall back silently.
      setExternalEvents([]);
      setExternalStatus("unavailable");
      return;
    }
    const { events, status } = await fetchNearbyExternalEvents({
      latitude: coords.latitude,
      longitude: coords.longitude,
      radiusKm: 30,
      category,
      from,
      to,
    });
    setExternalEvents(events);
    setExternalStatus(status);
  }, [from, to, category]);

  useEffect(() => {
    fetchEvents(true);
    fetchExternalEvents();
  }, [fetchEvents, fetchExternalEvents]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchEvents(true);
    fetchExternalEvents();
  }, [fetchEvents, fetchExternalEvents]);

  const eventsByCategory = useMemo(() => {
    const byCat: Record<string, EventCardItem[]> = {};
    EVENT_CATEGORIES.forEach((c) => {
      byCat[c.id] = winklyEvents.filter((e) => (e.category ?? "").toLowerCase().includes(c.id.toLowerCase()) || (e.category ?? "").toLowerCase().includes(c.label.toLowerCase()));
    });
    return byCat;
  }, [winklyEvents]);

  const filteredWinkly = useMemo(() => {
    if (!searchQuery.trim()) return winklyEvents;
    const q = searchQuery.trim().toLowerCase();
    return winklyEvents.filter((e) => e.title.toLowerCase().includes(q) || (e.location ?? "").toLowerCase().includes(q) || (e.venueName ?? "").toLowerCase().includes(q));
  }, [winklyEvents, searchQuery]);

  const filteredExternal = useMemo(() => {
    if (!searchQuery.trim()) return externalEvents;
    const q = searchQuery.trim().toLowerCase();
    return externalEvents.filter((e) => e.title.toLowerCase().includes(q) || (e.location ?? "").toLowerCase().includes(q) || (e.venueName ?? "").toLowerCase().includes(q));
  }, [externalEvents, searchQuery]);

  const handleAddToPlanner = useCallback(async (item: EventCardItem) => {
    try {
      if (item.winklyEventId) {
        await addWinklyEventToPlanner(item.winklyEventId);
        Alert.alert("Added", "Event added to your Planner.");
      } else {
        await addExternalEventToPlanner(item);
        Alert.alert("Added", "Event added to your Planner. Open the link there when you're ready to get tickets.");
      }
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not add to planner.");
    }
  }, []);

  const dateLabel = useMemo(() => {
    if (timeRange === "day") return selectedDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    if (timeRange === "week") {
      const { from: f } = getRangeBounds("week", selectedDate);
      const d = new Date(f);
      return `${d.toLocaleDateString(undefined, { month: "short" })} ${d.getDate()}–${d.getDate() + 6}`;
    }
    return selectedDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [timeRange, selectedDate]);

  return (
    <View style={styles.screen}>
      <ModeHeader currentMode="events" rightSlot="filterSettings" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        {PLAN_IT_ENTRY_ENABLED ? <PlanItBar mode="events" style={styles.planItBar} /> : null}
        <Text style={styles.pageTitle}>Discover Events</Text>
        <Text style={styles.pageSubtitle}>
          Explore what's happening — on Winkly and from Ticketmaster, Meetup and more. Add to your planner or open the link to get tickets.
        </Text>

        {/* ─── Filter: Time range + Date ─── */}
        <View style={styles.rangeRow}>
          {(["day", "week", "month"] as const).map((r) => (
            <Chip
              key={r}
              label={r === "day" ? "Day" : r === "week" ? "Week" : "Month"}
              mode="events"
              selected={timeRange === r}
              onPress={() => setTimeRange(r)}
            />
          ))}
          <Pressable onPress={() => setShowDatePicker(true)} style={styles.dateBtn}>
            <Ionicons name="calendar-outline" size={18} color={theme.colors.textPrimary} />
            <Text style={styles.dateBtnText}>{dateLabel}</Text>
          </Pressable>
        </View>

        {showDatePicker && (
          <View style={{ marginBottom: theme.spacing.md }}>
            {Platform.OS === "ios" && (
              <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: theme.spacing.sm }}>
                <TextButton title="Done" onPress={() => setShowDatePicker(false)} style={{ paddingHorizontal: 0 }} />
              </View>
            )}
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(_, d) => {
                if (d) setSelectedDate(d);
                if (Platform.OS === "android") setShowDatePicker(false);
              }}
            />
          </View>
        )}

        {/* ─── Category chips ─── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: theme.spacing.lg }} contentContainerStyle={styles.categoryRow}>
          <Chip label="All" mode="events" selected={category === null} onPress={() => setCategory(null)} />
          {EVENT_CATEGORIES.map((c) => (
            <Chip key={c.id} label={c.label} mode="events" selected={category === c.id} onPress={() => setCategory(c.id)} />
          ))}
        </ScrollView>

        {/* ─── Search ─── */}
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={20} color={theme.colors.textMuted} style={{ marginRight: theme.spacing.sm }} />
          <TextInput
            placeholder="Search events or locations..."
            placeholderTextColor={theme.colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={theme.modeAccent("events").primary} style={{ marginVertical: theme.spacing.xxl }} />
        ) : (
          <>
            {/* Winkly events strip */}
            <View style={styles.strip}>
              <Text style={styles.stripTitle}>Winkly events</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: theme.spacing.xl }}>
                {filteredWinkly.length === 0 ? (
                  <Card style={styles.stripEmptyCard}>
                    <Text style={styles.stripEmptyText}>No Winkly events in this range. Create one or check external events below.</Text>
                  </Card>
                ) : (
                  filteredWinkly.map((item) => (
                    <EventCard key={item.id} item={item} onAddToPlanner={handleAddToPlanner} onPress={(e) => e.winklyEventId && router.push(`/(modes)/events/event-details?event_id=${e.winklyEventId}`)} />
                  ))
                )}
              </ScrollView>
            </View>

            {/* Nearby external events — degrades gracefully if external APIs are unavailable */}
            <View style={styles.strip}>
              <Text style={styles.stripTitle}>Nearby on Ticketmaster &amp; more</Text>
              {externalStatus === "loading" ? (
                <ActivityIndicator size="small" color={theme.modeAccent("events").primary} style={{ marginVertical: theme.spacing.md, alignSelf: "flex-start" }} />
              ) : filteredExternal.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: theme.spacing.xl }}>
                  {filteredExternal.map((item) => (
                    <EventCard key={item.id} item={item} onAddToPlanner={handleAddToPlanner} onPress={(e) => e.winklyEventId && router.push(`/(modes)/events/event-details?event_id=${e.winklyEventId}`)} />
                  ))}
                </ScrollView>
              ) : (
                <Card style={styles.stripEmptyCard}>
                  <Text style={styles.stripEmptyText}>
                    {externalStatus === "unavailable"
                      ? "We couldn't reach our event providers right now. Showing Winkly events — pull to refresh to try again."
                      : "No nearby events from our event providers for this period. Browse Winkly events above."}
                  </Text>
                </Card>
              )}
            </View>

            {/* Winkly category strips */}
            {EVENT_CATEGORIES.map((cat) => {
              const winklyInCat = eventsByCategory[cat.id] ?? [];
              if (winklyInCat.length === 0) return null;
              return (
                <View key={cat.id} style={styles.strip}>
                  <Text style={styles.stripTitle}>{cat.label}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: theme.spacing.xl }}>
                    {winklyInCat.map((item) => (
                      <EventCard key={item.id} item={item} onAddToPlanner={handleAddToPlanner} onPress={(e) => e.winklyEventId && router.push(`/(modes)/events/event-details?event_id=${e.winklyEventId}`)} />
                    ))}
                  </ScrollView>
                </View>
              );
            })}

            {/* Show "All categories" strip if we have events and category filter is set */}
            {category && filteredWinkly.length > 0 && (
              <View style={styles.strip}>
                <Text style={styles.stripTitle}>In this period</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: theme.spacing.xl }}>
                  {filteredWinkly.map((item) => (
                    <EventCard key={item.id} item={item} onAddToPlanner={handleAddToPlanner} onPress={(e) => e.winklyEventId && router.push(`/(modes)/events/event-details?event_id=${e.winklyEventId}`)} />
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}

        {/* Create event CTA */}
        <Card style={styles.ctaCard}>
          <Text style={styles.ctaTitle}>Organize your own event</Text>
          <Text style={styles.ctaBody}>
            Host something exciting — parties, networking dinners, workshops or masterminds.
          </Text>
          <PrimaryButton
            title="Create Event"
            onPress={() => router.push("/(modes)/events/create-event")}
            style={{ backgroundColor: theme.colors.onPrimary }}
            textStyle={{ color: theme.colors.primary }}
          />
        </Card>
      </ScrollView>

      <EventsBottomNav />
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return {
    screen: { flex: 1, backgroundColor: theme.colors.background },
    scrollContent: { padding: theme.spacing.xl, paddingBottom: 120 },
    planItBar: { marginBottom: theme.spacing.xl },
    pageTitle: { ...theme.type.h1, fontFamily: theme.type.h1.fontFamily, color: theme.colors.textPrimary, marginBottom: theme.spacing.md },
    pageSubtitle: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, marginBottom: theme.spacing.md },
    rangeRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, alignItems: "center" as const, marginBottom: theme.spacing.md, gap: theme.spacing.sm },
    dateBtn: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      backgroundColor: theme.colors.backgroundMuted,
      borderRadius: theme.radii.pill,
      gap: theme.spacing.xs,
    },
    dateBtnText: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textPrimary },
    categoryRow: { gap: theme.spacing.sm, paddingRight: theme.spacing.xl },
    searchBox: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      marginBottom: theme.spacing.xl,
    },
    searchInput: { flex: 1, ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textPrimary },
    strip: { marginBottom: theme.spacing.xxl },
    stripTitle: { ...theme.type.h3, fontFamily: theme.type.h3.fontFamily, color: theme.colors.textPrimary, marginBottom: theme.spacing.md },
    stripEmptyCard: { width: 200, padding: theme.spacing.md },
    stripEmptyText: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary },
    ctaCard: { backgroundColor: theme.colors.primary, alignItems: "center" as const, marginTop: theme.spacing.md },
    ctaTitle: { ...theme.type.h3, fontFamily: theme.type.h3.fontFamily, color: theme.colors.onPrimary, marginBottom: theme.spacing.sm },
    ctaBody: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.onPrimary, marginBottom: theme.spacing.lg, textAlign: "center" as const },
  };
}
