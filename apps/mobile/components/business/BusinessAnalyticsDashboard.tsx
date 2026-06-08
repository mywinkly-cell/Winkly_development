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

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export function BusinessAnalyticsDashboard() {
  const router = useRouter();
  const primary = Colors.business.primary;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<BusinessAnalyticsPeriod>("week");
  const [summary, setSummary] = useState<BusinessAnalyticsSummary | null>(null);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      setSummary(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const data = await getBusinessAnalyticsSummary(uid, period);
    setSummary(data);
    setLoading(false);
    setRefreshing(false);
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  useEffect(() => {
    setLoading(true);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when period toggles
  }, [period]);

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
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Business analytics</Text>
        <Text style={styles.subtitle}>Measure profile views, offer engagement, and planner conversions.</Text>

        <View style={styles.periodRow}>
          {(["week", "month"] as const).map((p) => {
            const active = period === p;
            return (
              <TouchableOpacity
                key={p}
                onPress={() => setPeriod(p)}
                style={[styles.periodBtn, active && { backgroundColor: primary }]}
                activeOpacity={0.85}
              >
                <Text style={[styles.periodBtnText, active && styles.periodBtnTextActive]}>
                  {p === "week" ? "This week" : "This month"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <ActivityIndicator color={primary} style={{ marginTop: 24 }} />
        ) : summary ? (
          <>
            <View style={styles.grid}>
              <MetricCard label="Profile views" value={summary.profileViews} />
              <MetricCard label="Offer impressions" value={summary.offerImpressions} />
              <MetricCard label="Offer taps" value={summary.offerTaps} />
              <MetricCard label="Add to planner" value={summary.addToPlanner} />
            </View>

            <View style={styles.sponsoredCard}>
              <Text style={styles.sponsoredTitle}>Grow your reach</Text>
              <Text style={styles.sponsoredBody}>
                Create sponsored offers to appear in Romance & Friends Discover and AI concierge plans.
                Track impressions, taps, and planner conversions above.
              </Text>
              <TouchableOpacity
                onPress={() => router.push(Routes.businessOfferCreate)}
                style={styles.createOfferBtn}
                activeOpacity={0.85}
              >
                <Text style={styles.createOfferText}>Create offer</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <Text style={styles.subtitle}>Sign in with a business account to see analytics.</Text>
        )}
      </ScrollView>

      <BusinessBottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  scroll: { paddingHorizontal: Layout.screenPadding, paddingBottom: 100 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12, marginTop: 8 },
  backText: { ...Typography.body, color: Colors.textPrimary },
  title: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 6 },
  subtitle: { ...Typography.body, color: Colors.gray600, marginBottom: 16 },
  periodRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  periodBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Layout.radii.control,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  periodBtnText: { ...Typography.caption, color: Colors.gray700, fontWeight: "600" },
  periodBtnTextActive: { color: "#FFF" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    width: "48%",
    backgroundColor: "#FFF",
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 14,
  },
  metricValue: { ...Typography.h2, color: Colors.business.primary, marginBottom: 4 },
  metricLabel: { ...Typography.caption, color: Colors.gray600 },
  sponsoredCard: {
    marginTop: 16,
    backgroundColor: Colors.business.primary + "12",
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.business.primary + "33",
    padding: 14,
  },
  sponsoredTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 6 },
  sponsoredBody: { ...Typography.body, color: Colors.gray700, lineHeight: 20 },
  createOfferBtn: {
    marginTop: 12,
    backgroundColor: Colors.business.primary,
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    alignItems: "center",
  },
  createOfferText: { ...Typography.button, color: "#FFF" },
});
