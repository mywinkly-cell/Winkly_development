import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { ModeHeader } from "@/components/layout/ModeHeader";
import { EventsBottomNav } from "@/components/layout/EventsBottomNav";
import { Card, Chip, PrimaryButton, TextButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { useFormatLocationDisplay } from "@/lib/location/useLocationDisplay";
import { DiscoverModeToggle, type DiscoverViewMode } from "@/components/discover/DiscoverModeToggle";
import { TopPicksSection } from "@/components/discover/TopPicksSection";
import { buildEventTopPicks, type EventTopPick } from "@/lib/discover/eventTopPicks";

type EventRow = {
  id: string;
  title: string;
  city: string | null;
  venue_name: string | null;
  starts_at: string;
  ends_at: string | null;
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
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const fmtLoc = useFormatLocationDisplay();

  const [query, setQuery] = useState("");
  const [activeCity, setActiveCity] = useState<string | "all">("all");
  const [activeCategory, setActiveCategory] = useState<string | "all">("all");

  const [items, setItems] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // "Top 3 for you" is the landing state; the full scroll list is a deliberate "See all".
  const [viewMode, setViewMode] = useState<DiscoverViewMode>("top");
  const [topPicks, setTopPicks] = useState<EventTopPick[]>([]);
  const [topLoading, setTopLoading] = useState(true);

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

      // Default: show upcoming first (starts_at ascending)
      const { data, error } = await supabase
        .from("events")
        .select("id,title,city,venue_name,starts_at,ends_at,cover_url,category,tags,price_eur,capacity,visibility,created_at")
        .order("starts_at", { ascending: true })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only initial fetch
  }, []);

  // Build the concierge-ranked picks once events are loaded (or when filters change).
  // Only while in "top" mode so the full-list pagination doesn't trigger gateway calls.
  useEffect(() => {
    if (viewMode !== "top" || loading) return;
    let cancelled = false;
    setTopLoading(true);
    buildEventTopPicks({
      events: items,
      city: activeCity !== "all" ? activeCity : undefined,
      category: activeCategory !== "all" ? activeCategory : undefined,
    })
      .then((picks) => {
        if (!cancelled) setTopPicks(picks);
      })
      .finally(() => {
        if (!cancelled) setTopLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [items, activeCity, activeCategory, viewMode, loading]);

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
    <View style={styles.screen}>
      <View style={{ flex: 1 }}>
      <ModeHeader currentMode="events" rightSlot="filterSettings" />
      <View style={styles.header}>
        <Text style={styles.title}>Events</Text>
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          <TextButton title="Planner" onPress={() => router.push("/(modes)/events/planner")} style={styles.pillGhost} />
          <PrimaryButton
            title="Create"
            onPress={() => router.push("/(modes)/events/create-event")}
            style={{ ...styles.pill, backgroundColor: theme.modeAccent("events").primary }}
          />
        </View>
      </View>

      <DiscoverModeToggle
        value={viewMode}
        onChange={setViewMode}
        primaryColor={theme.modeAccent("events").primary}
        allLabel="All events"
        allCount={filtered.length}
      />

      {viewMode === "top" ? (
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.textPrimary} />}
        >
          <TopPicksSection
            picks={topPicks}
            loading={loading || topLoading}
            primaryColor={theme.modeAccent("events").primary}
            subheading="A few events worth your time — picked so you don't have to scroll."
            emptyText="No events to pick from yet. Tap See all events to browse or create one."
            placeholderEmoji="🎟️"
            onPressPick={openDetails}
            onSeeAll={() => setViewMode("all")}
            seeAllLabel="See all events"
          />
        </ScrollView>
      ) : (
        <>
      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search events, city, category…"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {!!query && (
            <Pressable onPress={() => setQuery("")} style={styles.clearBtn}>
              <Text style={{ color: theme.colors.textMuted }}>✕</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Quick filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersRow}>
        {(["all", "Munich", "Berlin", "Hamburg"] as const).map((c) => (
          <Chip
            key={c}
            label={c === "all" ? "All Cities" : c}
            mode="events"
            selected={activeCity === c}
            onPress={() => setActiveCity(c)}
            style={styles.filterChip}
          />
        ))}

        {(["all", "Social", "Business", "Fitness", "Culture"] as const).map((cat) => (
          <Chip
            key={cat}
            label={cat === "all" ? "All Types" : cat}
            mode="events"
            selected={activeCategory === cat}
            onPress={() => setActiveCategory(cat)}
            style={styles.filterChip}
          />
        ))}
      </ScrollView>

      <ScrollView
        style={styles.list}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.textPrimary} />}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const nearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 650;
          if (nearBottom) onLoadMore();
        }}
        scrollEventThrottle={16}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.modeAccent("events").primary} />
            <Text style={{ marginTop: theme.spacing.sm, color: theme.colors.textMuted }}>Loading events…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <Card style={styles.empty}>
            <Text style={styles.emptyTitle}>No events yet</Text>
            <Text style={styles.emptyText}>
              Create your first event or connect the `events` table + RLS to see results here.
            </Text>

            <PrimaryButton
              title="Create Event"
              onPress={() => router.push("/(modes)/events/create-event")}
              style={{ backgroundColor: theme.modeAccent("events").primary }}
            />
          </Card>
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            {filtered.map((e) => (
              <Pressable key={e.id} onPress={() => openDetails(e.id)}>
                <Card style={styles.card}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {e.title}
                    </Text>

                    <Text style={{ color: theme.colors.textMuted, marginTop: theme.spacing.xxs }} numberOfLines={1}>
                      {formatDateTime(e.starts_at)}
                      {e.city ? ` · ${fmtLoc(e.city)}` : ""}
                      {e.venue_name ? ` · ${e.venue_name}` : ""}
                    </Text>

                    <Text style={{ color: theme.colors.textPrimary, marginTop: theme.spacing.sm }} numberOfLines={2}>
                      {(e.category ? `${e.category} · ` : "") +
                        ((e.tags ?? []).slice(0, 3).join(" · ") || "Winkly event")}
                    </Text>
                  </View>

                  <View style={{ alignItems: "flex-end" }}>
                    <View style={styles.badge}>
                      <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
                        {e.price_eur != null ? `€${e.price_eur}` : "Free"}
                      </Text>
                    </View>
                    <Text style={{ color: theme.colors.textMuted, marginTop: theme.spacing.sm }}>›</Text>
                  </View>
                </View>
                </Card>
              </Pressable>
            ))}

            {loadingMore && (
              <View style={{ ...styles.center, paddingVertical: theme.spacing.md }}>
                <ActivityIndicator size="large" color={theme.modeAccent("events").primary} />
              </View>
            )}
          </View>
        )}
      </ScrollView>
        </>
      )}
      </View>
      <EventsBottomNav />
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return {
    screen: { flex: 1, backgroundColor: theme.colors.background },
    header: {
      paddingHorizontal: theme.spacing.lg,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.md,
    },
    title: { ...theme.type.h2, fontFamily: theme.type.h2.fontFamily, color: theme.colors.textPrimary },
    pill: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, borderRadius: theme.radii.pill },
    pillGhost: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, backgroundColor: theme.colors.surface, borderRadius: theme.radii.pill },

    searchRow: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm },
    searchBox: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.md,
      paddingHorizontal: theme.spacing.md,
      height: 46,
    },
    searchIcon: { marginRight: theme.spacing.sm, fontSize: 16, color: theme.colors.textMuted },
    searchInput: { flex: 1, fontSize: 15, color: theme.colors.textPrimary },
    clearBtn: { padding: theme.spacing.xs, marginLeft: theme.spacing.xxs },

    filtersRow: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm },
    filterChip: { marginRight: theme.spacing.sm },

    list: { flex: 1, paddingHorizontal: theme.spacing.lg },
    card: {},
    cardTitle: { ...theme.type.bodyMedium, fontFamily: theme.type.bodyMedium.fontFamily, fontWeight: "900" as const, color: theme.colors.textPrimary },
    badge: { paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, borderRadius: theme.radii.pill, backgroundColor: theme.colors.background },

    center: { paddingVertical: theme.spacing.xxl, alignItems: "center" as const, justifyContent: "center" as const },
    empty: { marginTop: theme.spacing.lg },
    emptyTitle: { ...theme.type.bodyMedium, fontFamily: theme.type.bodyMedium.fontFamily, fontWeight: "900" as const, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs },
    emptyText: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textMuted, marginBottom: theme.spacing.md },
  };
}
