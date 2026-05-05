// ────────────────────────────────────────────────
// Winkly Events Mode – Home Screen
// Discover: filter by day/week/month + category; Winkly events + external (Meetup, Eventbrite).
// Category strips: Music & Dancing, Nightlife, Performing Arts, Dating & Networking, Hobbies, Business, Food & Drink.
// See docs/EXTERNAL_EVENTS_AND_FILTERING.md
// ────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
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
import { ModeBottomBar } from "@/components/layout/ModeBottomBar";
import { EventCard, type EventCardItem } from "@/components/ui/EventCard";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { EVENT_CATEGORIES, type EventCategoryId, type EventTimeRange } from "@/constants/eventCategories";
import { addWinklyEventToPlanner } from "@/lib/access/events";
import { addExternalEventToPlanner } from "@/lib/externalEvents";
import { supabase } from "@/lib/supabase";
import { useSafeAreaInsets } from "@/lib/useSafeAreaInsets";

// Map DB event row to EventCardItem (supports start_at or starts_at)
function winklyRowToCard(row: Record<string, unknown>): EventCardItem {
  const startAt = (row.start_at ?? row.starts_at) as string;
  const endAt = (row.end_at ?? row.ends_at) as string | null;
  const imageUrl = (row.cover_url ?? row.cover_image_uri ?? row.cover_url) as string | null;
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

// Mock external events (until Edge Function is wired) — one per category for demo
function getMockExternalEvents(categoryId: EventCategoryId): EventCardItem[] {
  const labels: Record<EventCategoryId, string> = {
    music_dancing: "Live Jazz Night",
    nightlife: "Rooftop Bar Night",
    performing_arts: "Gallery Opening",
    dating_networking: "Speed Networking",
    hobbies: "Photography Walk",
    business: "Startup Mixer",
    food_drink: "Wine Tasting",
  };
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(19, 0, 0, 0);
  return [
    {
      id: `ext-${categoryId}-1`,
      title: labels[categoryId],
      description: "From external platform",
      imageUrl: null,
      startAt: d.toISOString(),
      endAt: null,
      location: "Downtown",
      venueName: "Venue TBA",
      hostName: "Meetup",
      externalUrl: "https://www.meetup.com/",
      externalPlatform: "meetup",
      category: categoryId,
    },
  ];
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
  useSafeAreaInsets(); // reserve safe area; values not needed in this screen

  const [timeRange, setTimeRange] = useState<EventTimeRange>("week");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [category, setCategory] = useState<EventCategoryId | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [winklyEvents, setWinklyEvents] = useState<EventCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { from, to } = useMemo(() => getRangeBounds(timeRange, selectedDate), [timeRange, selectedDate]);

  const fetchEvents = useCallback(async (reset?: boolean) => {
    if (reset) setLoading(true);
    try {
      const col = "start_at";
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

  useEffect(() => {
    fetchEvents(true);
  }, [fetchEvents]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchEvents(true);
  }, [fetchEvents]);

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
    <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
      <ModeHeader currentMode="events" rightSlot="filterSettings" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={{ ...Typography.h1, color: Colors.textPrimary, marginBottom: 12 }}>
          Discover Events
        </Text>
        <Text style={{ ...Typography.body, color: Colors.gray700, marginBottom: 16 }}>
          Explore what&apos;s happening — on Winkly and from Meetup, Eventbrite and more. Add to your planner or open the link to get tickets.
        </Text>

        {/* ─── Filter: Time range + Date ─── */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginBottom: 12, gap: 8 }}>
          {(["day", "week", "month"] as const).map((r) => (
            <TouchableOpacity
              key={r}
              onPress={() => setTimeRange(r)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 20,
                backgroundColor: timeRange === r ? Colors.primaryViolet : Colors.gray100,
              }}
            >
              <Text style={{ ...Typography.caption, color: timeRange === r ? Colors.accentYellow : Colors.textPrimary, fontWeight: "600" }}>
                {r === "day" ? "Day" : r === "week" ? "Week" : "Month"}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() => setShowDatePicker(true)}
            style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 12, backgroundColor: Colors.gray100, borderRadius: 20, gap: 6 }}
          >
            <Ionicons name="calendar-outline" size={18} color={Colors.textPrimary} />
            <Text style={{ ...Typography.caption, color: Colors.textPrimary }}>{dateLabel}</Text>
          </TouchableOpacity>
        </View>

        {showDatePicker && (
          <View style={{ marginBottom: 12 }}>
            {Platform.OS === "ios" && (
              <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 8 }}>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={{ ...Typography.button, color: Colors.primaryViolet }}>Done</Text>
                </TouchableOpacity>
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 8, paddingRight: 20 }}>
          <TouchableOpacity
            onPress={() => setCategory(null)}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: 20,
              backgroundColor: category === null ? Colors.primaryViolet : Colors.gray100,
            }}
          >
            <Text style={{ ...Typography.caption, color: category === null ? Colors.accentYellow : Colors.textPrimary }}>All</Text>
          </TouchableOpacity>
          {EVENT_CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => setCategory(c.id)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 20,
                backgroundColor: category === c.id ? Colors.primaryViolet : Colors.gray100,
              }}
            >
              <Text style={{ ...Typography.caption, color: category === c.id ? Colors.accentYellow : Colors.textPrimary }} numberOfLines={1}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ─── Search ─── */}
        <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: Colors.gray300, borderRadius: Layout.radii.control, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 20 }}>
          <Ionicons name="search-outline" size={20} color={Colors.gray500} style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search events or locations..."
            placeholderTextColor={Colors.gray500}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={{ flex: 1, ...Typography.body, color: Colors.textPrimary }}
          />
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginVertical: 24 }} />
        ) : (
          <>
            {/* Winkly events strip */}
            <View style={{ marginBottom: 24 }}>
              <Text style={{ ...Typography.h3, color: Colors.textPrimary, marginBottom: 12 }}>Winkly events</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20 }}>
                {filteredWinkly.length === 0 ? (
                  <View style={{ width: 200, padding: 16, backgroundColor: Colors.gray100, borderRadius: Layout.radii.card }}>
                    <Text style={{ ...Typography.caption, color: Colors.gray600 }}>No Winkly events in this range. Create one or check external events below.</Text>
                  </View>
                ) : (
                  filteredWinkly.map((item) => (
                    <EventCard key={item.id} item={item} onAddToPlanner={handleAddToPlanner} onPress={(e) => e.winklyEventId && router.push(`/(modes)/events/event-details?event_id=${e.winklyEventId}`)} />
                  ))
                )}
              </ScrollView>
            </View>

            {/* Category strips (Winkly + mock external) */}
            {EVENT_CATEGORIES.map((cat) => {
              const winklyInCat = eventsByCategory[cat.id] ?? [];
              const externalMock = getMockExternalEvents(cat.id);
              const combined = [...winklyInCat, ...externalMock];
              if (combined.length === 0) return null;
              return (
                <View key={cat.id} style={{ marginBottom: 24 }}>
                  <Text style={{ ...Typography.h3, color: Colors.textPrimary, marginBottom: 12 }}>{cat.label}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20 }}>
                    {combined.map((item) => (
                      <EventCard key={item.id} item={item} onAddToPlanner={handleAddToPlanner} onPress={(e) => e.winklyEventId && router.push(`/(modes)/events/event-details?event_id=${e.winklyEventId}`)} />
                    ))}
                  </ScrollView>
                </View>
              );
            })}

            {/* Show "All categories" strip if we have events and category filter is set */}
            {category && filteredWinkly.length > 0 && (
              <View style={{ marginBottom: 24 }}>
                <Text style={{ ...Typography.h3, color: Colors.textPrimary, marginBottom: 12 }}>In this period</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20 }}>
                  {filteredWinkly.map((item) => (
                    <EventCard key={item.id} item={item} onAddToPlanner={handleAddToPlanner} onPress={(e) => e.winklyEventId && router.push(`/(modes)/events/event-details?event_id=${e.winklyEventId}`)} />
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}

        {/* Create event CTA */}
        <View style={{ backgroundColor: Colors.primaryViolet, borderRadius: Layout.radii.card, padding: 20, marginTop: 20, alignItems: "center" }}>
          <Text style={{ ...Typography.h3, color: Colors.accentYellow, marginBottom: 8 }}>Organize your own event</Text>
          <Text style={{ ...Typography.caption, color: "#FFF", marginBottom: 16, textAlign: "center" }}>
            Host something exciting — parties, networking dinners, workshops or masterminds.
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/(modes)/events/create-event")}
            style={{ backgroundColor: Colors.accentYellow, borderRadius: Layout.radii.control, paddingVertical: 12, paddingHorizontal: 24 }}
          >
            <Text style={{ ...Typography.button, color: Colors.primaryViolet }}>Create Event</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ModeBottomBar mode="events" />
    </View>
  );
}
