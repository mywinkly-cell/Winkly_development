import React, { useCallback, useState } from "react";
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
import { supabase } from "@/lib/supabase";
import {
  getBusinessAnalyticsSummary,
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

export default function BusinessAnalytics() {
  const router = useRouter();
  const primary = Colors.business.primary;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
    const data = await getBusinessAnalyticsSummary(uid);
    setSummary(data);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

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

        <Text style={styles.title}>Business insights</Text>
        <Text style={styles.subtitle}>Last 30 days — profile views, offers, and connections.</Text>

        {loading ? (
          <ActivityIndicator color={primary} style={{ marginTop: 24 }} />
        ) : summary ? (
          <>
            <View style={styles.grid}>
              <MetricCard label="Profile views" value={summary.profileViews} />
              <MetricCard label="Offer impressions" value={summary.offerImpressions} />
              <MetricCard label="Offer clicks" value={summary.offerClicks} />
              <MetricCard label="Invites sent" value={summary.invitesSent} />
              <MetricCard label="Invites accepted" value={summary.invitesAccepted} />
              <MetricCard label="Active offers" value={summary.activeOffers} />
            </View>

            <View style={styles.sponsoredCard}>
              <Text style={styles.sponsoredTitle}>Sponsored placements</Text>
              <Text style={styles.sponsoredBody}>
                {summary.sponsoredOffers > 0
                  ? `${summary.sponsoredOffers} active sponsored offer${summary.sponsoredOffers === 1 ? "" : "s"} on Winkly.`
                  : "No active sponsored offers yet. Create an offer in your business profile to promote events and deals."}
              </Text>
            </View>
          </>
        ) : (
          <Text style={styles.subtitle}>Sign in with a business account to see insights.</Text>
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
});
