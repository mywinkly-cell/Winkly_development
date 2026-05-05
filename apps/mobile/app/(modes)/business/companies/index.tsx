import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { ModeHeader } from "@/components/layout/ModeHeader";
import { Colors, Typography, Layout } from "@/constants/tokens";

type CompanyRow = {
  id: string;
  name: string | null;
  city: string | null;
  industry: string | null;
  size: string | null;
  website: string | null;
  logo_url: string | null;
  tagline: string | null;
  created_at?: string | null;
};

const DEFAULT_PAGE_SIZE = 20;

function safeText(v: unknown) {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return "";
  return String(v);
}

function normalizeCompany(row: any): CompanyRow {
  return {
    id: row?.id,
    name: row?.name ?? row?.company_name ?? row?.title ?? null,
    city: row?.city ?? row?.hq_city ?? null,
    industry: row?.industry ?? row?.sector ?? null,
    size: row?.size ?? row?.company_size ?? null,
    website: row?.website ?? row?.url ?? null,
    logo_url: row?.logo_url ?? row?.logo ?? null,
    tagline: row?.tagline ?? row?.about_short ?? null,
    created_at: row?.created_at ?? null,
  };
}

export default function BusinessCompaniesIndex() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);

  const [items, setItems] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const filtersLabel = useMemo(() => {
    const parts = [];
    if (industry) parts.push(industry);
    if (city) parts.push(city);
    return parts.length ? parts.join(" · ") : "All companies";
  }, [industry, city]);

  const filtered = useMemo(() => {
    // Client-side filtering as a safe default.
    // Later you can push filtering into SQL/RPC.
    const q = query.trim().toLowerCase();
    return items.filter((c) => {
      const hay =
        `${c.name ?? ""} ${c.city ?? ""} ${c.industry ?? ""} ${c.tagline ?? ""}`.toLowerCase();
      const qOk = !q || hay.includes(q);
      const indOk = !industry || (c.industry ?? "").toLowerCase().includes(industry.toLowerCase());
      const cityOk = !city || (c.city ?? "").toLowerCase().includes(city.toLowerCase());
      return qOk && indOk && cityOk;
    });
  }, [items, query, industry, city]);

  async function fetchCompanies(opts?: { reset?: boolean }) {
    const reset = !!opts?.reset;

    try {
      if (reset) {
        setLoading(true);
        setPage(0);
        setHasMore(true);
      }

      const nextPage = reset ? 0 : page;
      const from = nextPage * DEFAULT_PAGE_SIZE;
      const to = from + DEFAULT_PAGE_SIZE - 1;

      // This is intentionally resilient:
      // - If you later create a `companies` table, it will work.
      // - If not, it will show a friendly empty state.
      const { data, error } = await supabase
        .from("companies")
        .select("id,name,city,industry,size,website,logo_url,tagline,created_at")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) {
        // Don’t crash the app; show a helpful message
        if (Platform.OS !== "web") {
          Alert.alert("Companies", "Couldn’t load companies yet. Please try again.");
        }
        // Keep previous data if any
        if (reset) setItems([]);
        setHasMore(false);
        return;
      }

      const normalized = (data ?? []).map(normalizeCompany);

      setItems((prev) => (reset ? normalized : [...prev, ...normalized]));
      setHasMore(normalized.length === DEFAULT_PAGE_SIZE);
      setPage((prev) => (reset ? 1 : prev + 1));
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    fetchCompanies({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchCompanies({ reset: true });
  };

  const onLoadMore = async () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    await fetchCompanies({ reset: false });
  };

  const onOpenCompany = (companyId: string) => {
    // You can later create: /(modes)/business/companies/[id].tsx
    // For now, route to discover with prefilled search query as a safe placeholder.
    router.push({
      pathname: "/(modes)/business/discover",
      params: { company_id: companyId },
    });
  };

  const clearFilters = () => {
    setIndustry(null);
    setCity(null);
  };

  return (
    <View style={[styles.screen, { backgroundColor: Colors.background }]}>
      <ModeHeader currentMode="business" rightSlot="filterSettings" />
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, Typography.h2]}>Companies</Text>
        <TouchableOpacity
          onPress={() => router.push("/(modes)/business/discover")}
          style={[styles.pill, { backgroundColor: Colors.card }]}
          activeOpacity={0.9}
        >
          <Text style={[styles.pillText, { color: Colors.text }]}>Discover</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
          <Text style={[styles.searchIcon, { color: Colors.mutedText }]}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search companies, city, industry…"
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

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersRow}>
        <TouchableOpacity
          onPress={() => setIndustry((v) => (v ? null : "Technology"))}
          style={[
            styles.filterChip,
            { backgroundColor: industry === "Technology" ? Colors.primary : Colors.card, borderColor: Colors.border },
          ]}
        >
          <Text style={{ color: industry === "Technology" ? Colors.onPrimary : Colors.text }}>
            Technology
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setIndustry((v) => (v ? null : "Finance"))}
          style={[
            styles.filterChip,
            { backgroundColor: industry === "Finance" ? Colors.primary : Colors.card, borderColor: Colors.border },
          ]}
        >
          <Text style={{ color: industry === "Finance" ? Colors.onPrimary : Colors.text }}>
            Finance
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setIndustry((v) => (v ? null : "Healthcare"))}
          style={[
            styles.filterChip,
            { backgroundColor: industry === "Healthcare" ? Colors.primary : Colors.card, borderColor: Colors.border },
          ]}
        >
          <Text style={{ color: industry === "Healthcare" ? Colors.onPrimary : Colors.text }}>
            Healthcare
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setCity((v) => (v ? null : "Munich"))}
          style={[
            styles.filterChip,
            { backgroundColor: city === "Munich" ? Colors.primary : Colors.card, borderColor: Colors.border },
          ]}
        >
          <Text style={{ color: city === "Munich" ? Colors.onPrimary : Colors.text }}>Munich</Text>
        </TouchableOpacity>

        {(industry || city) && (
          <TouchableOpacity
            onPress={clearFilters}
            style={[styles.filterChip, { backgroundColor: Colors.card, borderColor: Colors.border }]}
          >
            <Text style={{ color: Colors.text }}>Clear</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* List */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.text} />}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const nearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 600;
          if (nearBottom) onLoadMore();
        }}
        scrollEventThrottle={16}
      >
        <Text style={[styles.subtitle, { color: Colors.mutedText }]}>{filtersLabel}</Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={{ marginTop: 10, color: Colors.mutedText }}>Loading companies…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: Colors.text }]}>No companies yet</Text>
            <Text style={[styles.emptyText, { color: Colors.mutedText }]}>
              Once the Companies table is connected, you’ll see real results here.
            </Text>

            <TouchableOpacity
              onPress={() => router.push("/(modes)/business/discover")}
              style={[styles.cta, { backgroundColor: Colors.primary }]}
              activeOpacity={0.9}
            >
              <Text style={{ color: Colors.onPrimary, fontWeight: "700" }}>Go to Discover</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {filtered.map((c) => (
              <TouchableOpacity
                key={c.id}
                onPress={() => onOpenCompany(c.id)}
                activeOpacity={0.9}
                style={[styles.card, { backgroundColor: Colors.card, borderColor: Colors.border }]}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: Colors.text }]} numberOfLines={1}>
                      {c.name || "Unnamed company"}
                    </Text>

                    <Text style={{ color: Colors.mutedText }} numberOfLines={1}>
                      {safeText(c.industry) || "Industry"} · {safeText(c.city) || "City"}{" "}
                      {c.size ? `· ${c.size}` : ""}
                    </Text>

                    {!!c.tagline && (
                      <Text style={{ color: Colors.text, marginTop: 8 }} numberOfLines={2}>
                        {c.tagline}
                      </Text>
                    )}
                  </View>

                  <View style={styles.badgeCol}>
                    <View style={[styles.badge, { backgroundColor: Colors.background }]}>
                      <Text style={{ color: Colors.mutedText, fontSize: 12 }}>Company</Text>
                    </View>
                    {!!c.website && (
                      <View style={[styles.badge, { backgroundColor: Colors.background, marginTop: 8 }]}>
                        <Text style={{ color: Colors.mutedText, fontSize: 12 }}>Website</Text>
                      </View>
                    )}
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
  title: { fontWeight: "800" },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  pillText: { fontWeight: "700" },
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
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 10,
  },
  list: { flex: 1, paddingHorizontal: Layout?.screenPadding ?? 16 },
  subtitle: { marginBottom: 10 },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: "800" },
  badgeCol: { alignItems: "flex-end", justifyContent: "flex-start" },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  center: { paddingVertical: 30, alignItems: "center", justifyContent: "center" },
  empty: {
    marginTop: 22,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", marginBottom: 6 },
  emptyText: { lineHeight: 20, marginBottom: 12 },
  cta: { borderRadius: 14, paddingVertical: 12, alignItems: "center" },
};
