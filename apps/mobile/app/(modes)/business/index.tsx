// Business Mode — Home: curated suggestions, pending invites, search + chips

import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
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
import { PendingInvitesSheet } from "@/components/business/PendingInvitesSheet";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import { getProfilesForMode } from "@/lib/access/profiles";
import { getBlockedUserIdSet } from "@/lib/access/blocks";
import { countPendingBusinessInvites } from "@/lib/access/businessConnections";
import { useBusinessSearch } from "@/hooks/useBusinessSearch";
import { BUSINESS_FILTER_CHIPS } from "@/constants/profileOptions";
import {
  mapProfilesBusinessRow,
  rankSimilarProfiles,
  buildViewerContext,
  type BusinessPersonItem,
} from "@/lib/business/homeFeed";
import {
  getBusinessRecentEntries,
  recordBusinessProfileView,
  type BusinessRecentEntry,
} from "@/lib/business/recentSearchStorage";
import { getLastDiscoverQuery } from "@/lib/business/discoverQueryStorage";
import { getOwnProfileCore, getOwnProfileMode } from "@/lib/access/profiles";
import * as Location from "expo-location";

const COL_WIDTH = (Dimensions.get("window").width - 40 - 12) / 3;

export default function BusinessHome() {
  const router = useRouter();
  const primary = Colors.business.primary;

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

      const [blocked, core, modeProfile, feedRows, pending, lastDiscover] = await Promise.all([
        getBlockedUserIdSet(uid),
        getOwnProfileCore(uid),
        getOwnProfileMode(uid, "business"),
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
          style={styles.pendingBanner}
          onPress={() => {
            Haptics.selectionAsync();
            setPendingSheetVisible(true);
          }}
        >
          <Text style={styles.pendingText}>
            {pendingCount} connection request{pendingCount === 1 ? "" : "s"}
          </Text>
          <Ionicons name="chevron-forward" size={20} color={primary} />
        </Pressable>
      ) : null}

      <View style={styles.newsletterCard}>
        <Text style={styles.newsletterTitle}>Network brief</Text>
        <Text style={styles.newsletterBody}>
          Send thoughtful invites (20+ chars), respond on Home, then plan a meet-up or co-host an event from chat.
        </Text>
        <TouchableOpacity
          onPress={() => router.push("/(modes)/business/discover")}
          style={styles.newsletterCta}
          activeOpacity={0.85}
        >
          <Text style={styles.newsletterCtaText}>Explore Discover</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={primary} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />}
          contentContainerStyle={styles.scrollContent}
        >
          <Section
            title="Suggested for you"
            hint={search.hasActiveFilter ? "Filtered results" : "Ranked for your goals and skills"}
          >
            {suggested.length === 0 ? (
              <EmptyHint text="Complete your Business profile to see better matches." />
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
            <TouchableOpacity
              style={styles.seeMore}
              onPress={() => router.replace("/(modes)/business/discover")}
            >
              <Text style={styles.seeMoreText}>See more in Discover</Text>
            </TouchableOpacity>
          </Section>

          {!search.hasActiveFilter && lastSearchPeople.length > 0 ? (
            <Section title="Based on your search" hint="From your last Discover search">
              <HorizontalRow people={lastSearchPeople} onPress={openProfile} />
            </Section>
          ) : null}

          {!search.hasActiveFilter && hasLocation && nearby.length > 0 ? (
            <Section title="In your area" hint="Near you">
              <HorizontalRow people={nearby} onPress={openProfile} />
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
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

function HorizontalRow({
  people,
  onPress,
}: {
  people: BusinessPersonItem[];
  onPress: (p: BusinessPersonItem) => void;
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

function EmptyHint({ text }: { text: string }) {
  return (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  scrollContent: { paddingBottom: 120 },
  pendingBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 20,
    marginTop: 8,
    padding: 14,
    borderRadius: Layout.radii.card,
    backgroundColor: Colors.business.secondary,
  },
  pendingText: { ...Typography.body, fontWeight: "600", color: Colors.business.primary },
  newsletterCard: {
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 4,
    padding: 14,
    borderRadius: Layout.radii.card,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  newsletterTitle: { ...Typography.body, fontWeight: "700", color: Colors.textPrimary, marginBottom: 6 },
  newsletterBody: { ...Typography.caption, color: Colors.gray600, lineHeight: 18, marginBottom: 10 },
  newsletterCta: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.business.primary,
  },
  newsletterCtaText: { ...Typography.caption, fontWeight: "700", color: Colors.white },
  section: { marginBottom: 24 },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  sectionHint: {
    ...Typography.caption,
    color: Colors.gray500,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  grid3: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    gap: 12,
    justifyContent: "flex-start",
  },
  hRow: { paddingHorizontal: 20, paddingBottom: 4, gap: 12 },
  emptyBox: {
    marginHorizontal: 20,
    padding: 16,
    borderRadius: Layout.radii.card,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  emptyText: { ...Typography.body, color: Colors.gray700, textAlign: "center" },
  seeMore: { paddingHorizontal: 20, marginTop: 8 },
  seeMoreText: { ...Typography.caption, color: Colors.business.primary, fontWeight: "600" },
});
