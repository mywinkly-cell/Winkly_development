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
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { useFormatLocationDisplay } from "@/lib/location/useLocationDisplay";

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
  const fmtLoc = useFormatLocationDisplay();
  const theme = useAppTheme();
  const styles = createStyles(theme);

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
    <View style={styles.screen}>
      <ModeHeader currentMode="business" rightSlot="filterSettings" />
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Companies</Text>
        <TouchableOpacity
          onPress={() => router.push("/(modes)/business/discover")}
          style={styles.pill}
          activeOpacity={0.9}
        >
          <Text style={styles.pillText}>Discover</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search companies, city, industry…"
            placeholderTextColor={theme.colors.textSecondary}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery("")} style={styles.clearBtn}>
              <Text style={{ color: theme.colors.textSecondary }}>✕</Text>
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
            { backgroundColor: industry === "Technology" ? theme.colors.primary : theme.colors.surface },
          ]}
        >
          <Text style={{ color: industry === "Technology" ? theme.colors.onPrimary : theme.colors.textPrimary }}>
            Technology
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setIndustry((v) => (v ? null : "Finance"))}
          style={[
            styles.filterChip,
            { backgroundColor: industry === "Finance" ? theme.colors.primary : theme.colors.surface },
          ]}
        >
          <Text style={{ color: industry === "Finance" ? theme.colors.onPrimary : theme.colors.textPrimary }}>
            Finance
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setIndustry((v) => (v ? null : "Healthcare"))}
          style={[
            styles.filterChip,
            { backgroundColor: industry === "Healthcare" ? theme.colors.primary : theme.colors.surface },
          ]}
        >
          <Text style={{ color: industry === "Healthcare" ? theme.colors.onPrimary : theme.colors.textPrimary }}>
            Healthcare
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setCity((v) => (v ? null : "Munich"))}
          style={[
            styles.filterChip,
            { backgroundColor: city === "Munich" ? theme.colors.primary : theme.colors.surface },
          ]}
        >
          <Text style={{ color: city === "Munich" ? theme.colors.onPrimary : theme.colors.textPrimary }}>Munich</Text>
        </TouchableOpacity>

        {(industry || city) && (
          <TouchableOpacity
            onPress={clearFilters}
            style={styles.filterChip}
          >
            <Text style={{ color: theme.colors.textPrimary }}>Clear</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* List */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.textPrimary} />}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const nearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 600;
          if (nearBottom) onLoadMore();
        }}
        scrollEventThrottle={16}
      >
        <Text style={styles.subtitle}>{filtersLabel}</Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.modeAccent("business").primary} />
            <Text style={{ marginTop: 10, color: theme.colors.textSecondary }}>Loading companies…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No companies yet</Text>
            <Text style={styles.emptyText}>
              Once the Companies table is connected, you’ll see real results here.
            </Text>

            <TouchableOpacity
              onPress={() => router.push("/(modes)/business/discover")}
              style={styles.cta}
              activeOpacity={0.9}
            >
              <Text style={{ color: theme.colors.onPrimary, fontWeight: "700" }}>Go to Discover</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {filtered.map((c) => (
              <TouchableOpacity
                key={c.id}
                onPress={() => onOpenCompany(c.id)}
                activeOpacity={0.9}
                style={styles.card}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {c.name || "Unnamed company"}
                    </Text>

                    <Text style={{ color: theme.colors.textSecondary }} numberOfLines={1}>
                      {safeText(c.industry) || "Industry"} ·{" "}
                      {c.city?.trim() ? fmtLoc(safeText(c.city)) : "City"}{" "}
                      {c.size ? `· ${c.size}` : ""}
                    </Text>

                    {!!c.tagline && (
                      <Text style={{ color: theme.colors.textPrimary, marginTop: 8 }} numberOfLines={2}>
                        {c.tagline}
                      </Text>
                    )}
                  </View>

                  <View style={styles.badgeCol}>
                    <View style={styles.badge}>
                      <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>Company</Text>
                    </View>
                    {!!c.website && (
                      <View style={[styles.badge, { marginTop: 8 }]}>
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>Website</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}

            {loadingMore && (
              <View style={[styles.center, { paddingVertical: 12 }]}>
                <ActivityIndicator size="large" color={theme.modeAccent("business").primary} />
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return {
    screen: { flex: 1, paddingTop: theme.spacing.md, backgroundColor: theme.colors.background },
    header: {
      paddingHorizontal: theme.spacing.xl,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: 12,
      paddingBottom: 12,
    },
    title: { ...theme.type.h2, fontWeight: "800" as const, color: theme.colors.textPrimary },
    pill: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: theme.colors.surface,
    },
    pillText: { fontWeight: "700" as const, color: theme.colors.textPrimary },
    searchRow: { paddingHorizontal: theme.spacing.xl, paddingBottom: 10 },
    searchBox: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 12,
      height: 46,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
    },
    searchIcon: { marginRight: 8, fontSize: 16, color: theme.colors.textSecondary },
    searchInput: { flex: 1, fontSize: 15, color: theme.colors.textPrimary },
    clearBtn: { padding: 6, marginLeft: 4 },
    filtersRow: { paddingHorizontal: theme.spacing.xl, paddingBottom: 10 },
    filterChip: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginRight: 10,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
    },
    list: { flex: 1, paddingHorizontal: theme.spacing.xl },
    subtitle: { marginBottom: 10, color: theme.colors.textSecondary },
    card: {
      borderWidth: 1,
      borderRadius: 18,
      padding: 14,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
    },
    cardTitle: { fontSize: 16, fontWeight: "800" as const, color: theme.colors.textPrimary },
    badgeCol: { alignItems: "flex-end" as const, justifyContent: "flex-start" as const },
    badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: theme.colors.background },
    center: { paddingVertical: 30, alignItems: "center" as const, justifyContent: "center" as const },
    empty: {
      marginTop: 22,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    emptyTitle: { fontSize: 16, fontWeight: "800" as const, marginBottom: 6, color: theme.colors.textPrimary },
    emptyText: { lineHeight: 20, marginBottom: 12, color: theme.colors.textSecondary },
    cta: { borderRadius: 14, paddingVertical: 12, alignItems: "center" as const, backgroundColor: theme.colors.primary },
  };
}
