// Business Mode — Home: curated suggestions, pending invites, search + chips

import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Dimensions,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ModeHeader } from "@/components/layout/ModeHeader";
import { BusinessBottomNav } from "@/components/layout/BusinessBottomNav";
import { BusinessProfileCard } from "@/components/business/BusinessProfileCard";
import { BusinessFilterSheet } from "@/components/business/BusinessFilterSheet";
import { BusinessHomeEmptyState } from "@/components/business/BusinessHomeEmptyState";
import { PendingInvitesSheet } from "@/components/business/PendingInvitesSheet";
import { Card, SectionHeader, TextButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { Routes } from "@/constants/routes";
import { supabase } from "@/lib/supabase";
import { getProfilesForMode, getOwnProfileCore, getOwnProfileMode } from "@/lib/access/profiles";
import { getBlockedUserIdSet } from "@/lib/access/blocks";
import { countPendingBusinessInvites } from "@/lib/access/businessConnections";
import { useBusinessSearch } from "@/hooks/useBusinessSearch";
import {
  mapProfilesBusinessRow,
  rankSimilarProfiles,
  buildViewerContext,
  type BusinessPersonItem,
} from "@/lib/business/homeFeed";
import { recordBusinessProfileView } from "@/lib/business/recentSearchStorage";
import { getLastDiscoverQuery } from "@/lib/business/discoverQueryStorage";
import { isBusinessProfileComplete } from "@/lib/routing/splash";
import * as Location from "expo-location";
import { useAuth } from "@/providers";

const COL_WIDTH = (Dimensions.get("window").width - 40 - 12) / 3;

export default function BusinessHome() {
  const router = useRouter();
  const { accountType } = useAuth();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const primary = theme.modeAccent("business").primary;
  const isBusinessAccount = accountType === "business";

  const search = useBusinessSearch();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [pendingSheetVisible, setPendingSheetVisible] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [suggested, setSuggested] = useState<BusinessPersonItem[]>([]);
  const [lastSearchPeople, setLastSearchPeople] = useState<BusinessPersonItem[]>([]);
  const [nearby, setNearby] = useState<BusinessPersonItem[]>([]);
  const [hasLocation, setHasLocation] = useState(false);
  const [businessProfileComplete, setBusinessProfileComplete] = useState(true);

  const openProfile = useCallback(
    (person: BusinessPersonItem, source: "home" | "discover" = "home") => {
      void recordBusinessProfileView({
        id: person.id,
        name: person.name,
        subtitle: person.subtitle,
        meta: person.meta,
        photoUrl: person.photoUrl,
      });
      router.push({
        pathname: "/(modes)/business/profile-view",
        params: { user_id: person.id, source },
      });
    },
    [router]
  );

  const load = useCallback(async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        setSuggested([]);
        setPendingCount(0);
        return;
      }

      const [blocked, core, modeProfile, businessProfileRow, feedRows, pending, lastDiscover] = await Promise.all([
        getBlockedUserIdSet(uid),
        getOwnProfileCore(uid),
        getOwnProfileMode(uid, "business"),
        supabase
          .from("business_profiles")
          .select("business_name")
          .or(`id.eq.${uid},user_id.eq.${uid}`)
          .limit(1)
          .maybeSingle(),
        getProfilesForMode("business", uid, 20, {
          query: search.feedParams.query,
          roleType: search.feedParams.roleType,
          networkingGoal: search.feedParams.networkingGoal,
          sort: "relevant",
        }),
        countPendingBusinessInvites(),
        getLastDiscoverQuery(),
      ]);

      setPendingCount(pending);
      setBusinessProfileComplete(
        isBusinessProfileComplete(businessProfileRow.data as { business_name?: string } | null)
      );

      const meta = (modeProfile?.meta ?? {}) as Record<string, unknown>;
      const viewer = buildViewerContext({
        city: (core as { city?: string })?.city ?? null,
        location: (modeProfile as { location?: string })?.location ?? null,
        meta,
        tags: Array.isArray(modeProfile?.interests) ? (modeProfile.interests as string[]) : [],
      });

      const candidates = (feedRows as Record<string, unknown>[])
        .map(mapProfilesBusinessRow)
        .filter((p) => p.id && p.id !== uid && !blocked.has(p.id));

      if (search.hasActiveFilter) {
        setSuggested(candidates.slice(0, 6));
        setLastSearchPeople([]);
        setNearby([]);
      } else {
        setSuggested(rankSimilarProfiles(viewer, candidates, 6));
        if (lastDiscover?.searchQuery?.trim() || lastDiscover?.chip) {
          const matchRows = await getProfilesForMode("business", uid, 5, {
            query: lastDiscover.searchQuery,
            roleType: lastDiscover.chip?.roleType ?? null,
            networkingGoal: lastDiscover.chip?.goal ?? null,
          });
          setLastSearchPeople(
            (matchRows as Record<string, unknown>[])
              .map(mapProfilesBusinessRow)
              .filter((p) => !blocked.has(p.id))
              .slice(0, 5)
          );
        } else {
          setLastSearchPeople([]);
        }

        const { status } = await Location.getForegroundPermissionsAsync();
        const locOk = status === "granted";
        setHasLocation(locOk);
        if (locOk) {
          const city = (core as { city?: string })?.city ?? viewer.city;
          const near = candidates
            .filter((p) => p.meta && city && p.meta.toLowerCase().includes(String(city).toLowerCase().split(",")[0] ?? ""))
            .slice(0, 3);
          setNearby(near.length ? near : candidates.slice(0, 3));
        } else {
          setNearby([]);
        }
      }
    } catch (e) {
      console.warn("BusinessHome load", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search.feedParams, search.hasActiveFilter]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const showHomeEmptyState =
    !loading &&
    !search.hasActiveFilter &&
    (!businessProfileComplete ||
      (suggested.length === 0 && lastSearchPeople.length === 0 && nearby.length === 0));

  return (
    <View style={styles.screen}>
      <ModeHeader
        currentMode="business"
        leftSlot="filters"
        rightSlot="ai"
        showSearchBar
        searchValue={search.searchValue}
        onSearchChange={search.setSearchValue}
        activeChip={search.activeChip}
        onChipSelect={search.selectChip}
        onFilterPress={() => setFilterSheetVisible(true)}
        onClearFilters={search.clearAll}
      />

      {pendingCount > 0 ? (
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setPendingSheetVisible(true);
          }}
        >
          <Card padding="md" style={{ ...styles.pendingBanner, backgroundColor: theme.modeAccent("business").bg }}>
            <Text style={{ ...styles.pendingText, color: primary }}>
              {pendingCount} connection request{pendingCount === 1 ? "" : "s"}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={primary} />
          </Card>
        </Pressable>
      ) : null}

      {!showHomeEmptyState && !loading ? (
        <Card padding="md" style={styles.newsletterCard}>
          <Text style={styles.newsletterTitle}>Network brief</Text>
          <Text style={styles.newsletterBody}>
            Send thoughtful invites (20+ chars), respond on Home, then plan a meet-up or co-host an event from chat.
          </Text>
          <View style={styles.newsletterActions}>
            <Pressable
              onPress={() => router.push("/(modes)/business/discover")}
              style={{ ...styles.newsletterCta, backgroundColor: primary }}
            >
              <Text style={styles.newsletterCtaText}>Explore Discover</Text>
            </Pressable>
            {isBusinessAccount ? (
              <Pressable
                onPress={() => router.push(Routes.businessAnalytics)}
                style={{ ...styles.insightsCta, borderColor: primary + "55", backgroundColor: theme.modeAccent("business").bg }}
              >
                <Ionicons name="stats-chart-outline" size={16} color={primary} />
                <Text style={{ ...styles.insightsCtaText, color: primary }}>Insights</Text>
              </Pressable>
            ) : null}
          </View>
        </Card>
      ) : null}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={primary} />
        </View>
      ) : showHomeEmptyState ? (
        <BusinessHomeEmptyState
          onEditProfile={() => router.push("/profile/edit-business")}
          onExploreDiscover={() => router.push("/(modes)/business/discover")}
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />}
          contentContainerStyle={styles.scrollContent}
        >
          <Section
            title="Suggested for you"
            hint={search.hasActiveFilter ? "Filtered results" : "Ranked for your goals and skills"}
            theme={theme}
          >
            {suggested.length === 0 ? (
              <EmptyHint text="Complete your Business profile to see better matches." theme={theme} />
            ) : (
              <View style={styles.grid3}>
                {suggested.map((person) => (
                  <BusinessProfileCard
                    key={person.id}
                    person={person}
                    columnWidth={COL_WIDTH}
                    onPress={() => openProfile(person)}
                  />
                ))}
              </View>
            )}
            <TextButton
              title="See more in Discover"
              onPress={() => router.replace("/(modes)/business/discover")}
              style={styles.seeMore}
            />
          </Section>

          {!search.hasActiveFilter && lastSearchPeople.length > 0 ? (
            <Section title="Based on your search" hint="From your last Discover search" theme={theme}>
              <HorizontalRow people={lastSearchPeople} onPress={openProfile} styles={styles} />
            </Section>
          ) : null}

          {!search.hasActiveFilter && hasLocation && nearby.length > 0 ? (
            <Section title="In your area" hint="Near you" theme={theme}>
              <HorizontalRow people={nearby} onPress={openProfile} styles={styles} />
            </Section>
          ) : null}
        </ScrollView>
      )}

      <BusinessFilterSheet
        visible={filterSheetVisible}
        onClose={() => setFilterSheetVisible(false)}
        onApplied={() => void load()}
      />
      <PendingInvitesSheet
        visible={pendingSheetVisible}
        onClose={() => setPendingSheetVisible(false)}
        onChanged={() => void load()}
      />
      <BusinessBottomNav />
    </View>
  );
}

function Section({
  title,
  hint,
  children,
  theme,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  theme: AppTheme;
}) {
  return (
    <View style={{ marginBottom: theme.spacing.xxl }}>
      <SectionHeader title={title} subtitle={hint} style={{ paddingHorizontal: theme.spacing.xl, marginBottom: theme.spacing.xs }} />
      {children}
    </View>
  );
}

function HorizontalRow({
  people,
  onPress,
  styles,
}: {
  people: BusinessPersonItem[];
  onPress: (p: BusinessPersonItem) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
      {people.map((person) => (
        <BusinessProfileCard
          key={person.id}
          person={person}
          onPress={() => onPress(person)}
          columnWidth={COL_WIDTH * 1.4}
        />
      ))}
    </ScrollView>
  );
}

function EmptyHint({ text, theme }: { text: string; theme: AppTheme }) {
  return (
    <Card style={{ marginHorizontal: theme.spacing.xl }}>
      <Text style={{ ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, textAlign: "center" }}>{text}</Text>
    </Card>
  );
}

function createStyles(theme: AppTheme) {
  return {
    screen: { flex: 1, backgroundColor: theme.colors.background },
    centered: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const },
    scrollContent: { paddingBottom: 120 },
    pendingBanner: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      marginHorizontal: theme.spacing.xl,
      marginTop: theme.spacing.sm,
    },
    pendingText: { ...theme.type.bodyMedium, fontFamily: theme.type.bodyMedium.fontFamily },
    newsletterCard: {
      marginHorizontal: theme.spacing.xl,
      marginTop: theme.spacing.sm,
      marginBottom: theme.spacing.xxs,
    },
    newsletterTitle: { ...theme.type.bodyMedium, fontFamily: theme.type.bodyMedium.fontFamily, fontWeight: "700" as const, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs },
    newsletterBody: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
    newsletterActions: { flexDirection: "row" as const, alignItems: "center" as const, gap: theme.spacing.sm, flexWrap: "wrap" as const },
    newsletterCta: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radii.pill,
    },
    newsletterCtaText: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, fontWeight: "700" as const, color: theme.colors.onPrimary },
    insightsCta: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing.xs,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
    },
    insightsCtaText: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, fontWeight: "700" as const },
    grid3: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      paddingHorizontal: theme.spacing.xl,
      gap: theme.spacing.md,
      justifyContent: "flex-start" as const,
    },
    hRow: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xxs, gap: theme.spacing.md },
    seeMore: { paddingHorizontal: theme.spacing.xl, marginTop: theme.spacing.sm, alignSelf: "flex-start" as const },
  };
}
