import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { ModeHeader } from "@/components/layout/ModeHeader";
import { Colors, Typography, Layout } from "@/constants/tokens";

type EventRow = {
  id: string;
  title: string;
  city: string | null;
  venue_name: string | null;
  start_at: string;
  end_at: string | null;
  cover_url: string | null;
  category: string | null;
  tags: string[] | null;
  price_eur: number | null;
  capacity: number | null;
  visibility?: string | null;
  created_at?: string | null;
};

const PAGE_SIZE = 20;

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function EventsDiscover() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [activeCity, setActiveCity] = useState<string | "all">("all");
  const [activeCategory, setActiveCategory] = useState<string | "all">("all");

  const [items, setItems] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((e) => {
      const qOk =
        !q ||
        `${e.title} ${e.city ?? ""} ${e.venue_name ?? ""} ${e.category ?? ""} ${(e.tags ?? []).join(" ")}`.toLowerCase().includes(q);

      const cityOk = activeCity === "all" || (e.city ?? "").toLowerCase().includes(activeCity.toLowerCase());
      const catOk = activeCategory === "all" || (e.category ?? "").toLowerCase().includes(activeCategory.toLowerCase());

      return qOk && cityOk && catOk;
    });
  }, [items, query, activeCity, activeCategory]);

  async function fetchEvents(opts?: { reset?: boolean }) {
    const reset = !!opts?.reset;
    try {
      if (reset) {
        setLoading(true);
        setItems([]);
        setPage(0);
        setHasMore(true);
      }

      const nextPage = reset ? 0 : page;
      const from = nextPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // Default: show upcoming first (start_at ascending)
      const { data, error } = await supabase
        .from("events")
        .select("id,title,city,venue_name,start_at,end_at,cover_url,category,tags,price_eur,capacity,visibility,created_at")
        .order("start_at", { ascending: true })
        .range(from, to);

      if (error) {
        // Safe empty state if table/RLS not ready
        setHasMore(false);
        return;
      }

      const rows = (data ?? []) as EventRow[];
      setItems((prev) => (reset ? rows : [...prev, ...rows]));
      setHasMore(rows.length === PAGE_SIZE);
      setPage((prev) => (reset ? 1 : prev + 1));
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    fetchEvents({ reset: true });
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchEvents({ reset: true });
  };

  const onLoadMore = async () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    await fetchEvents({ reset: false });
  };

  const openDetails = (eventId: string) => {
    router.push({
      pathname: "/(modes)/events/event-details",
      params: { event_id: eventId },
    });
  };

  return (
    <View style={[styles.screen, { backgroundColor: Colors.background }]}>
      <ModeHeader currentMode="events" rightSlot="filterSettings" />
      <View style={styles.header}>
        <Text style={[styles.title, Typography.h2]}>Events</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TouchableOpacity
            onPress={() => router.push("/(modes)/events/planner")}
            style={[styles.pill, { backgroundColor: Colors.card }]}
            activeOpacity={0.9}
          >
            <Text style={[styles.pillText, { color: Colors.text }]}>Planner</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/(modes)/events/create-event")}
            style={[styles.pill, { backgroundColor: Colors.primary }]}
            activeOpacity={0.9}
          >
            <Text style={[styles.pillText, { color: Colors.onPrimary }]}>Create</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
          <Text style={[styles.searchIcon, { color: Colors.mutedText }]}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search events, city, category…"
            placeholderTextColor={Colors.mutedText}
            style={[styles.searchInput, { color: Colors.text }]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery("")} style={styles.clearBtn}>
              <Text style={{ color: Colors.mutedText }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Quick filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersRow}>
        {(["all", "Munich", "Berlin", "Hamburg"] as const).map((c) => {
          const active = activeCity === c;
          return (
            <TouchableOpacity
              key={c}
              onPress={() => setActiveCity(c)}
              style={[
                styles.filterChip,
                { backgroundColor: active ? Colors.primary : Colors.card, borderColor: Colors.border },
              ]}
              activeOpacity={0.9}
            >
              <Text style={{ color: active ? Colors.onPrimary : Colors.text, fontWeight: "700" }}>
                {c === "all" ? "All Cities" : c}
              </Text>
            </TouchableOpacity>
          );
        })}

        {(["all", "Social", "Business", "Fitness", "Culture"] as const).map((cat) => {
          const active = activeCategory === cat;
          return (
            <TouchableOpacity
              key={cat}
              onPress={() => setActiveCategory(cat)}
              style={[
                styles.filterChip,
                { backgroundColor: active ? Colors.primary : Colors.card, borderColor: Colors.border },
              ]}
              activeOpacity={0.9}
            >
              <Text style={{ color: active ? Colors.onPrimary : Colors.text, fontWeight: "700" }}>
                {cat === "all" ? "All Types" : cat}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        style={styles.list}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.text} />}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const nearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 650;
          if (nearBottom) onLoadMore();
        }}
        scrollEventThrottle={16}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={{ marginTop: 10, color: Colors.mutedText }}>Loading events…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
            <Text style={{ color: Colors.text, fontWeight: "900" }}>No events yet</Text>
            <Text style={{ color: Colors.mutedText, marginTop: 6, lineHeight: 18 }}>
              Create your first event or connect the `events` table + RLS to see results here.
            </Text>

            <TouchableOpacity
              onPress={() => router.push("/(modes)/events/create-event")}
              style={[styles.cta, { backgroundColor: Colors.primary }]}
              activeOpacity={0.9}
            >
              <Text style={{ color: Colors.onPrimary, fontWeight: "900" }}>Create Event</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {filtered.map((e) => (
              <TouchableOpacity
                key={e.id}
                onPress={() => openDetails(e.id)}
                activeOpacity={0.9}
                style={[styles.card, { backgroundColor: Colors.card, borderColor: Colors.border }]}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: Colors.text, fontWeight: "900", fontSize: 16 }} numberOfLines={1}>
                      {e.title}
                    </Text>

                    <Text style={{ color: Colors.mutedText, marginTop: 4 }} numberOfLines={1}>
                      {formatDateTime(e.start_at)}
                      {e.city ? ` · ${e.city}` : ""}
                      {e.venue_name ? ` · ${e.venue_name}` : ""}
                    </Text>

                    <Text style={{ color: Colors.text, marginTop: 8 }} numberOfLines={2}>
                      {(e.category ? `${e.category} · ` : "") +
                        ((e.tags ?? []).slice(0, 3).join(" · ") || "Winkly event")}
                    </Text>
                  </View>

                  <View style={{ alignItems: "flex-end" }}>
                    <View style={[styles.badge, { backgroundColor: Colors.background }]}>
                      <Text style={{ color: Colors.mutedText, fontSize: 12 }}>
                        {e.price_eur != null ? `€${e.price_eur}` : "Free"}
                      </Text>
                    </View>
                    <Text style={{ color: Colors.mutedText, marginTop: 10 }}>›</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}

            {loadingMore && (
              <View style={[styles.center, { paddingVertical: 12 }]}>
                <ActivityIndicator />
              </View>
            )}
          </View>
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
  title: { fontWeight: "900" },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  pillText: { fontWeight: "800" },

  searchRow: { paddingHorizontal: Layout?.screenPadding ?? 16, paddingBottom: 10 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 46,
  },
  searchIcon: { marginRight: 8, fontSize: 16 },
  searchInput: { flex: 1, fontSize: 15 },
  clearBtn: { padding: 6, marginLeft: 4 },

  filtersRow: { paddingHorizontal: Layout?.screenPadding ?? 16, paddingBottom: 10 },
  filterChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, marginRight: 10 },

  list: { flex: 1, paddingHorizontal: Layout?.screenPadding ?? 16 },
  card: { borderWidth: 1, borderRadius: 18, padding: 14 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },

  center: { paddingVertical: 30, alignItems: "center", justifyContent: "center" },
  empty: { marginTop: 16, borderWidth: 1, borderRadius: 18, padding: 16 },
  cta: { marginTop: 12, borderRadius: 14, paddingVertical: 12, alignItems: "center" },
};
