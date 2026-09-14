import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { ModeHeader } from "@/components/layout/ModeHeader";
import { Card, Chip, PrimaryButton, SecondaryButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import {
  getBusinessFilters,
  applyBusinessFiltersToFeed,
  type BusinessFiltersState,
} from "@/lib/filters/businessFiltersStorage";
import { getBlockedUserIdSet } from "@/lib/access/blocks";
import { getProfilesForMode } from "@/lib/access/profiles";
import { BusinessBottomNav } from "@/components/layout/BusinessBottomNav";
import { BusinessDiscoverListCard } from "@/components/business/BusinessDiscoverListCard";
import {
  mapProfilesBusinessRow,
  buildViewerContext,
  rankSimilarProfiles,
  buildBusinessFitReason,
  type BusinessPersonItem,
} from "@/lib/business/homeFeed";
import { DiscoverModeToggle, type DiscoverViewMode } from "@/components/discover/DiscoverModeToggle";
import { TopPicksSection, type TopPickCard } from "@/components/discover/TopPicksSection";
import { TOP_PICKS_LIMIT } from "@/lib/discover/topPicks";

type ResultType = "person" | "company" | "service";

type DiscoverResult = {
  id: string;
  type: ResultType;
  title: string;
  subtitle?: string;
  meta?: string;
  avatar_url?: string | null;
  industry?: string | null;
  person?: BusinessPersonItem;
};

const PAGE_SIZE = 20;

function asString(v: unknown) {
  return typeof v === "string" ? v : "";
}

export default function BusinessDiscover() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
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

  // "Top 3 for you" is the landing state; the full search list is a deliberate "See all".
  const [viewMode, setViewMode] = useState<DiscoverViewMode>("top");

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

  // "Top 3 for you": reuse the EXISTING business similarity ranking over the people
  // already loaded (no new logic), each with a concrete "why this fits you" line.
  const topPicks = useMemo<TopPickCard[]>(() => {
    const people = results
      .filter((r) => r.type === "person" && r.person)
      .map((r) => r.person as BusinessPersonItem);
    if (people.length === 0) return [];
    const viewer = buildViewerContext({ savedFilters: savedFilters ?? undefined });
    return rankSimilarProfiles(viewer, people, TOP_PICKS_LIMIT).map((p) => ({
      id: p.id,
      title: p.name,
      subtitle: p.subtitle ?? null,
      photoUrl: p.photoUrl,
      fitReason: buildBusinessFitReason(viewer, p),
      badge: null,
    }));
  }, [results, savedFilters]);

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
            .select("id, display_name, role_title, city, company_name, main_photo_url, avatar_url, logo_uri, industry, networking_goals, skills, created_at")
            .order("created_at", { ascending: false })
            .range(from, to);
          if (!error && data) personRows = data as Record<string, unknown>[];
        }
        for (const row of personRows) {
          const id = String(row.id ?? "");
          if (!id || blocked.has(id)) continue;
          const person = mapProfilesBusinessRow(row);
          batches.push({
            id,
            type: "person",
            title: person.name,
            subtitle: person.subtitle,
            meta: person.meta,
            avatar_url: person.photoUrl,
            industry: (row.industry as string) ?? person.intentGoal ?? null,
            person,
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
    <View style={styles.screen}>
      <View style={{ flex: 1 }}>
      <ModeHeader
        currentMode="business"
        rightSlot="filters"
        onFilterPress={() => router.push("/(modes)/business/filters")}
      />
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Discover</Text>
        <Pressable
          onPress={() => router.push("/(modes)/business/planner")}
          style={styles.pill}
        >
          <Text style={styles.pillText}>Planner</Text>
        </Pressable>
      </View>

      <DiscoverModeToggle
        value={viewMode}
        onChange={setViewMode}
        primaryColor={theme.modeAccent("business").primary}
        allLabel="See all"
        allCount={filtered.length}
      />

      {viewMode === "top" ? (
        <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 32 }}>
          <TopPicksSection
            picks={topPicks}
            loading={loading}
            primaryColor={theme.modeAccent("business").primary}
            subheading="A few people worth reaching out to — picked so you don't have to scroll."
            emptyText="No people to pick from yet. Tap See all to browse the full directory."
            placeholderEmoji="💼"
            onPressPick={(id) =>
              router.push({ pathname: "/(modes)/business/profile-view", params: { user_id: id } })
            }
            onSeeAll={() => setViewMode("all")}
            seeAllLabel="See all"
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
            placeholder={hint}
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

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersRow}>
        {(["all", "person", "company", "service"] as const).map((t) => {
          const active = activeType === t;
          const label = t === "all" ? "All" : t === "person" ? "People" : t === "company" ? "Companies" : "Services";
          return (
            <Chip
              key={t}
              label={label}
              mode="business"
              selected={active}
              onPress={() => setActiveType(t)}
              style={styles.filterChip}
            />
          );
        })}
        <Chip
          label="Communities · Soon"
          selected={false}
          disabled
          onPress={() =>
            Alert.alert(
              "Communities",
              "Professional communities are coming soon — curated groups by industry and goal."
            )
          }
          style={styles.filterChip}
        />
      </ScrollView>

      {/* Results */}
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
            <ActivityIndicator size="large" color={theme.modeAccent("business").primary} />
            <Text style={{ marginTop: theme.spacing.sm, color: theme.colors.textMuted }}>Loading discover feed…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <Card style={styles.empty}>
            <Text style={styles.emptyTitle}>No results yet</Text>
            <Text style={styles.emptyText}>
              Connect your Business tables (or add an RPC search) to populate Discover.
            </Text>

            <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
              <SecondaryButton
                title="Companies"
                onPress={() => router.push("/(modes)/business/companies")}
                style={{ flex: 1 }}
              />
              <PrimaryButton
                title="Open Planner"
                onPress={() => router.push("/(modes)/business/planner")}
                style={{ flex: 1, backgroundColor: theme.modeAccent("business").primary }}
              />
            </View>
          </Card>
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            {filtered.map((r) =>
              r.type === "person" && r.person ? (
                <BusinessDiscoverListCard
                  key={`${r.type}:${r.id}`}
                  person={r.person}
                  industry={r.industry}
                  onPress={() => openResult(r)}
                />
              ) : (
              <Pressable key={`${r.type}:${r.id}`} onPress={() => openResult(r)}>
                <Card style={styles.card}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {r.title}
                    </Text>
                    {!!r.subtitle && (
                      <Text style={{ color: theme.colors.textMuted }} numberOfLines={1}>
                        {r.subtitle}
                      </Text>
                    )}
                    {!!r.meta && (
                      <Text style={{ color: theme.colors.textPrimary, marginTop: theme.spacing.sm }} numberOfLines={2}>
                        {r.meta}
                      </Text>
                    )}
                  </View>

                  <View style={styles.rightCol}>
                    <View style={styles.badge}>
                      <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
                        {r.type === "person" ? "Person" : r.type === "company" ? "Company" : "Service"}
                      </Text>
                    </View>
                    <Text style={{ color: theme.colors.textMuted, marginTop: theme.spacing.sm }}>›</Text>
                  </View>
                </View>
                </Card>
              </Pressable>
              )
            )}

            {loadingMore && (
              <View style={{ ...styles.center, paddingVertical: theme.spacing.md }}>
                <ActivityIndicator size="large" color={theme.modeAccent("business").primary} />
              </View>
            )}
          </View>
        )}
      </ScrollView>
        </>
      )}
      </View>
      <BusinessBottomNav />
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
    pill: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surface },
    pillText: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, fontWeight: "700" as const, color: theme.colors.textPrimary },

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
    cardTitle: { ...theme.type.bodyMedium, fontFamily: theme.type.bodyMedium.fontFamily, fontWeight: "800" as const, color: theme.colors.textPrimary },
    rightCol: { alignItems: "flex-end" as const, justifyContent: "space-between" as const },
    badge: { paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, borderRadius: theme.radii.pill, backgroundColor: theme.colors.background },

    center: { paddingVertical: theme.spacing.xxl, alignItems: "center" as const, justifyContent: "center" as const },

    empty: { marginTop: theme.spacing.xl },
    emptyTitle: { ...theme.type.bodyMedium, fontFamily: theme.type.bodyMedium.fontFamily, fontWeight: "800" as const, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs },
    emptyText: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textMuted, marginBottom: theme.spacing.md },
  };
}
