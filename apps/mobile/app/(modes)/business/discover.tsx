import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { ModeHeader } from "@/components/layout/ModeHeader";
import { Colors, Typography, Layout } from "@/constants/tokens";
import {
  getBusinessFilters,
  applyBusinessFiltersToFeed,
  type BusinessFiltersState,
} from "@/lib/filters/businessFiltersStorage";
import { getBlockedUserIdSet } from "@/lib/access/blocks";
import { getProfilesForMode } from "@/lib/access/profiles";
import { BusinessBottomNav } from "@/components/layout/BusinessBottomNav";

type ResultType = "person" | "company" | "service";

type DiscoverResult = {
  id: string;
  type: ResultType;
  title: string;
  subtitle?: string;
  meta?: string;
  avatar_url?: string | null;
};

const PAGE_SIZE = 20;

function asString(v: unknown) {
  return typeof v === "string" ? v : "";
}

export default function BusinessDiscover() {
  const router = useRouter();
  const params = useLocalSearchParams<{ company_id?: string }>();

  const [query, setQuery] = useState("");
  const [activeType, setActiveType] = useState<ResultType | "all">("all");

  const [results, setResults] = useState<DiscoverResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savedFilters, setSavedFilters] = useState<BusinessFiltersState | null>(null);

  useEffect(() => {
    getBusinessFilters().then(setSavedFilters);
  }, []);

  useFocusEffect(
    useCallback(() => {
      getBusinessFilters().then(setSavedFilters);
    }, [])
  );

  const hint = useMemo(() => {
    if (params?.company_id) return "Company selected. You can find people, services & partners.";
    return "Search people, companies, services, speakers, mentors…";
  }, [params?.company_id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byQueryAndType = results.filter((r) => {
      const qOk =
        !q ||
        `${r.title} ${r.subtitle ?? ""} ${r.meta ?? ""}`.toLowerCase().includes(q);
      const tOk = activeType === "all" || r.type === activeType;
      return qOk && tOk;
    });
    if (!savedFilters) return byQueryAndType;
    return applyBusinessFiltersToFeed(byQueryAndType, savedFilters);
  }, [results, query, activeType, savedFilters]);

  async function fetchDiscover(opts?: { reset?: boolean }) {
    const reset = !!opts?.reset;

    try {
      if (reset) {
        setLoading(true);
        setResults([]);
        setPage(0);
        setHasMore(true);
      }

      const nextPage = reset ? 0 : page;
      const from = nextPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // We keep it robust:
      // - Try to load from known tables if exist.
      // - If they don't, return an empty list safely.
      //
      // Later you can replace with ONE RPC: public.business_discover(p_query, p_type, ...)
      const batches: DiscoverResult[] = [];
      const { data: auth } = await supabase.auth.getUser();
      const blocked = auth?.user?.id ? await getBlockedUserIdSet(auth.user.id) : new Set<string>();

      // 1) People — mode-safe RPC feed (falls back to table read if RPC empty)
      if (activeType === "all" || activeType === "person") {
        const uid = auth?.user?.id;
        let personRows: Record<string, unknown>[] = [];
        if (uid) {
          const feed = await getProfilesForMode("business", uid, PAGE_SIZE);
          personRows = (feed ?? []) as Record<string, unknown>[];
        }
        if (personRows.length === 0) {
          const { data, error } = await supabase
            .from("business_profiles")
            .select("id, display_name, role_title, city, company_name, main_photo_url, avatar_url, created_at")
            .order("created_at", { ascending: false })
            .range(from, to);
          if (!error && data) personRows = data as Record<string, unknown>[];
        }
        for (const row of personRows) {
          const id = String(row.id ?? "");
          if (!id || blocked.has(id)) continue;
          const title =
            (row.business_name as string) ??
            (row.display_name as string) ??
            "Professional";
          const subtitle = [row.role_title, row.company_name, row.area]
            .filter(Boolean)
            .join(" · ");
          const meta = (row.location as string) ?? (row.city as string) ?? undefined;
          const avatar_url =
            (row.logo_uri as string) ??
            (row.main_photo_url as string) ??
            (row.avatar_url as string) ??
            null;

          batches.push({
            id,
            type: "person",
            title,
            subtitle: subtitle || undefined,
            meta,
            avatar_url,
          });
        }
      }

      // 2) Companies from companies table
      if (activeType === "all" || activeType === "company") {
        const { data, error } = await supabase
          .from("companies")
          .select("id,name,industry,city,tagline,logo_url,created_at")
          .order("created_at", { ascending: false })
          .range(from, to);

        if (!error && data) {
          for (const row of data as any[]) {
            batches.push({
              id: row.id,
              type: "company",
              title: row?.name ?? "Company",
              subtitle: [row?.industry, row?.city].filter(Boolean).join(" · "),
              meta: row?.tagline ?? undefined,
              avatar_url: row?.logo_url ?? null,
            });
          }
        }
      }

      // 3) Services from business_services (optional)
      if (activeType === "all" || activeType === "service") {
        const { data, error } = await supabase
          .from("business_services")
          .select("id,title,category,city,short_description,cover_url,created_at")
          .order("created_at", { ascending: false })
          .range(from, to);

        if (!error && data) {
          for (const row of data as any[]) {
            batches.push({
              id: row.id,
              type: "service",
              title: row?.title ?? "Service",
              subtitle: [row?.category, row?.city].filter(Boolean).join(" · "),
              meta: row?.short_description ?? undefined,
              avatar_url: row?.cover_url ?? null,
            });
          }
        }
      }

      // If the tables don’t exist, Supabase returns errors.
      // We keep UX friendly and still allow UI usage.
      // To avoid spamming alerts on initial setup, only alert if it's not a reset.
      if (reset && batches.length === 0) {
        // no-op: show empty state
      }

      setResults((prev) => (reset ? batches : [...prev, ...batches]));

      // Has more: heuristic (if any batch returned close to PAGE_SIZE, keep loading)
      // It’s not perfect for multi-table batching, but fine until you migrate to RPC.
      setHasMore(batches.length >= Math.min(PAGE_SIZE, 10));
      setPage((prev) => (reset ? 1 : prev + 1));
    } catch (e: any) {
      Alert.alert("Discover", asString(e?.message) || "Something went wrong.");
      setHasMore(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    fetchDiscover({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeType]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDiscover({ reset: true });
  };

  const onLoadMore = async () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    await fetchDiscover({ reset: false });
  };

  const openResult = (r: DiscoverResult) => {
    if (r.type === "person") {
      router.push({
        pathname: "/(modes)/business/profile-view",
        params: { user_id: r.id },
      });
      return;
    }

    if (r.type === "company") {
      router.push({
        pathname: "/(modes)/business/companies",
      });
      return;
    }

    // service
    Alert.alert("Service", "Service details screen can be added next.");
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[styles.screen, { flex: 1, backgroundColor: Colors.background }]}>
      <ModeHeader
        currentMode="business"
        rightSlot="filters"
        onFilterPress={() => router.push("/(modes)/business/filters")}
      />
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, Typography.h2]}>Discover</Text>
        <TouchableOpacity
          onPress={() => router.push("/(modes)/business/planner")}
          style={[styles.pill, { backgroundColor: Colors.card }]}
          activeOpacity={0.9}
        >
          <Text style={[styles.pillText, { color: Colors.text }]}>Planner</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
          <Text style={[styles.searchIcon, { color: Colors.mutedText }]}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={hint}
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

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersRow}>
        {(["all", "person", "company", "service"] as const).map((t) => {
          const active = activeType === t;
          const label = t === "all" ? "All" : t === "person" ? "People" : t === "company" ? "Companies" : "Services";
          return (
            <TouchableOpacity
              key={t}
              onPress={() => setActiveType(t)}
              style={[
                styles.filterChip,
                { backgroundColor: active ? Colors.primary : Colors.card, borderColor: Colors.border },
              ]}
              activeOpacity={0.9}
            >
              <Text style={{ color: active ? Colors.onPrimary : Colors.text, fontWeight: "700" }}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Results */}
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
            <Text style={{ marginTop: 10, color: Colors.mutedText }}>Loading discover feed…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: Colors.text }]}>No results yet</Text>
            <Text style={[styles.emptyText, { color: Colors.mutedText }]}>
              Connect your Business tables (or add an RPC search) to populate Discover.
            </Text>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => router.push("/(modes)/business/companies")}
                style={[styles.ctaSecondary, { backgroundColor: Colors.card, borderColor: Colors.border }]}
                activeOpacity={0.9}
              >
                <Text style={{ color: Colors.text, fontWeight: "700" }}>Companies</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push("/(modes)/business/planner")}
                style={[styles.cta, { backgroundColor: Colors.primary }]}
                activeOpacity={0.9}
              >
                <Text style={{ color: Colors.onPrimary, fontWeight: "800" }}>Open Planner</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {filtered.map((r) => (
              <TouchableOpacity
                key={`${r.type}:${r.id}`}
                onPress={() => openResult(r)}
                activeOpacity={0.9}
                style={[styles.card, { backgroundColor: Colors.card, borderColor: Colors.border }]}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: Colors.text }]} numberOfLines={1}>
                      {r.title}
                    </Text>
                    {!!r.subtitle && (
                      <Text style={{ color: Colors.mutedText }} numberOfLines={1}>
                        {r.subtitle}
                      </Text>
                    )}
                    {!!r.meta && (
                      <Text style={{ color: Colors.text, marginTop: 8 }} numberOfLines={2}>
                        {r.meta}
                      </Text>
                    )}
                  </View>

                  <View style={styles.rightCol}>
                    <View style={[styles.badge, { backgroundColor: Colors.background }]}>
                      <Text style={{ color: Colors.mutedText, fontSize: 12 }}>
                        {r.type === "person" ? "Person" : r.type === "company" ? "Company" : "Service"}
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
      <BusinessBottomNav />
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
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
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
  card: { borderWidth: 1, borderRadius: 18, padding: 14 },
  cardTitle: { fontSize: 16, fontWeight: "800" },
  rightCol: { alignItems: "flex-end", justifyContent: "space-between" },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },

  center: { paddingVertical: 30, alignItems: "center", justifyContent: "center" },

  empty: {
    marginTop: 22,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    backgroundColor: Colors.card,
    borderColor: Colors.border,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", marginBottom: 6 },
  emptyText: { lineHeight: 20, marginBottom: 12 },
  cta: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center" },
  ctaSecondary: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
  },
};
