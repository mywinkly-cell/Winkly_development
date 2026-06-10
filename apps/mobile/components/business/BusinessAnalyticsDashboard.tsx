import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/providers";
import { Ionicons } from "@expo/vector-icons";
import { ModeHeader } from "@/components/layout/ModeHeader";
import { BusinessBottomNav } from "@/components/layout/BusinessBottomNav";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { Routes } from "@/constants/routes";
import { supabase } from "@/lib/supabase";
import {
  getBusinessAnalyticsSummary,
  type BusinessAnalyticsPeriod,
  type BusinessAnalyticsSummary,
} from "@/lib/business/analyticsStore";
import {
  formatBusinessOfferSummaryLine,
  getBusinessOfferDisplayStatus,
  isBusinessOfferDashboardVisible,
  listOwnBusinessOffers,
  type BusinessOfferDisplayStatus,
  type BusinessOfferRow,
} from "@/lib/business/offersStore";

function formatMetric(value: number): string {
  return value.toLocaleString("en-US");
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{formatMetric(value)}</Text>
    </View>
  );
}

const STATUS_BADGE: Record<
  Extract<BusinessOfferDisplayStatus, "active" | "scheduled">,
  { label: string; bg: string; text: string }
> = {
  active: { label: "Active", bg: "#E8F8EE", text: "#248A3D" },
  scheduled: { label: "Scheduled", bg: "#FFF3E0", text: "#E65100" },
};

function ActiveOfferRow({ offer }: { offer: BusinessOfferRow }) {
  const status = getBusinessOfferDisplayStatus(offer);
  const badge = status === "active" || status === "scheduled" ? STATUS_BADGE[status] : null;

  return (
    <View style={styles.offerRow}>
      <View style={styles.offerRowMain}>
        <Text style={styles.offerTitle} numberOfLines={1}>
          {offer.title}
        </Text>
        <Text style={styles.offerMeta} numberOfLines={2}>
          {formatBusinessOfferSummaryLine(offer)}
        </Text>
      </View>
      {badge ? (
        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.statusBadgeText, { color: badge.text }]}>{badge.label}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function BusinessAnalyticsDashboard() {
  const router = useRouter();
  const { accountType } = useAuth();
  const primary = Colors.business.primary;
  const isBusinessAccount = accountType === "business";
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<BusinessAnalyticsPeriod>("week");
  const [summary, setSummary] = useState<BusinessAnalyticsSummary | null>(null);
  const [offers, setOffers] = useState<BusinessOfferRow[]>([]);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      setSummary(null);
      setOffers([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const [analytics, ownOffers] = await Promise.all([
      getBusinessAnalyticsSummary(uid, period),
      listOwnBusinessOffers(uid),
    ]);
    setSummary(analytics);
    setOffers(ownOffers.filter(isBusinessOfferDashboardVisible));
    setLoading(false);
    setRefreshing(false);
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      if (accountType === "personal") {
        router.replace("/(modes)/business");
        return;
      }
      setLoading(true);
      void load();
    }, [accountType, load, router])
  );

  useEffect(() => {
    setLoading(true);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when period toggles
  }, [period]);

  const togglePeriod = () => {
    setPeriod((current) => (current === "week" ? "month" : "week"));
  };

  return (
    <View style={styles.screen}>
      <ModeHeader currentMode="business" leftSlot="filters" rightSlot="ai" />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={primary}
          />
        }
      >
        <View style={styles.dashboardCard}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="briefcase-outline" size={20} color={Colors.textPrimary} />
              <Text style={styles.cardTitle}>Business · Analytics</Text>
            </View>
            <TouchableOpacity
              onPress={togglePeriod}
              style={styles.periodPill}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Time range: ${period === "week" ? "This week" : "This month"}. Tap to change.`}
            >
              <Text style={styles.periodPillText}>{period === "week" ? "This week" : "This month"}</Text>
              <Ionicons name="chevron-down" size={14} color={Colors.gray700} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color={primary} style={styles.loader} />
          ) : summary ? (
            <>
              <View style={styles.grid}>
                <MetricCard label="Profile views" value={summary.profileViews} />
                <MetricCard label="Offer impressions" value={summary.offerImpressions} />
                <MetricCard label="Offer taps" value={summary.offerTaps} />
                <MetricCard label="Added to planner" value={summary.addToPlanner} />
              </View>

              <Text style={styles.sectionTitle}>Active offers</Text>

              {offers.length === 0 ? (
                <Text style={styles.emptyOffers}>No active or scheduled offers yet.</Text>
              ) : (
                offers.map((offer) => <ActiveOfferRow key={offer.id} offer={offer} />)
              )}

              <TouchableOpacity
                onPress={() => router.push(Routes.businessOfferCreate)}
                style={styles.createOfferCard}
                activeOpacity={0.85}
              >
                <View style={styles.createOfferIcon}>
                  <Ionicons name="add" size={22} color={primary} />
                </View>
                <Text style={styles.createOfferText}>
                  Create offer · 3 steps: details → audience → budget
                </Text>
              </TouchableOpacity>
            </>
          ) : !isBusinessAccount ? (
            <Text style={styles.signInHint}>Business analytics are available on business accounts only.</Text>
          ) : (
            <Text style={styles.signInHint}>Sign in with a business account to see analytics.</Text>
          )}
        </View>
      </ScrollView>

      <BusinessBottomNav />
    </View>
  );
}

const METRIC_BEIGE = "#F5F2ED";

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundMuted },
  scroll: { paddingHorizontal: Layout.screenPadding, paddingTop: 12, paddingBottom: 100 },
  dashboardCard: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  cardTitle: { ...Typography.h3, color: Colors.textPrimary, fontSize: 18 },
  periodPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  periodPillText: { ...Typography.caption, color: Colors.gray700, fontWeight: "600" },
  loader: { marginVertical: 32 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  metricCard: {
    width: "48%",
    backgroundColor: METRIC_BEIGE,
    borderRadius: Layout.radii.control,
    padding: 14,
  },
  metricLabel: { ...Typography.caption, color: Colors.gray600, marginBottom: 6 },
  metricValue: { fontSize: 28, lineHeight: 34, fontWeight: "700", color: Colors.textPrimary },
  sectionTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 12, fontSize: 18 },
  emptyOffers: { ...Typography.body, color: Colors.gray600, marginBottom: 12 },
  offerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
  offerRowMain: { flex: 1 },
  offerTitle: { ...Typography.body, fontWeight: "700", color: Colors.textPrimary, marginBottom: 4 },
  offerMeta: { ...Typography.caption, color: Colors.gray600, lineHeight: 18 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 2,
  },
  statusBadgeText: { ...Typography.caption, fontWeight: "600", fontSize: 12 },
  createOfferCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
    padding: 14,
    borderRadius: Layout.radii.control,
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderStyle: "dashed",
  },
  createOfferIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.business.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  createOfferText: { ...Typography.body, color: Colors.gray700, flex: 1, lineHeight: 22 },
  signInHint: { ...Typography.body, color: Colors.gray600 },
});
