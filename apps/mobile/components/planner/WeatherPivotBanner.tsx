/**
 * Weather pivot banner — surfaces proactive indoor alternatives created by the
 * `weather-pivot-cron` Edge Function (~24h before a confirmed plan, when severe
 * weather is forecast). Reads pending_plans.status = 'pivot_pending' and offers
 * Accept (confirm the indoor pivot) / Dismiss.
 */

import React, { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography } from "@/constants/tokens";
import {
  getPendingWeatherPivots,
  dismissWeatherPivot,
  confirmPendingPlan,
  type WeatherPivotPlan,
} from "@/lib/ai/conciergeClient";

function formatPivotDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function WeatherPivotBanner() {
  const [pivots, setPivots] = useState<WeatherPivotPlan[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    getPendingWeatherPivots().then((rows) => {
      if (!cancelled) setPivots(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(load);

  const handleDismiss = useCallback(async (pivot: WeatherPivotPlan) => {
    Haptics.selectionAsync();
    setPivots((prev) => prev.filter((p) => p.id !== pivot.id));
    await dismissWeatherPivot(pivot.id);
  }, []);

  const handleAccept = useCallback(async (pivot: WeatherPivotPlan) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusyId(pivot.id);
    try {
      await confirmPendingPlan(pivot.id);
      setPivots((prev) => prev.filter((p) => p.id !== pivot.id));
    } catch {
      Alert.alert("Couldn’t confirm", "Please try again in a moment.");
    } finally {
      setBusyId(null);
    }
  }, []);

  if (pivots.length === 0) return null;

  return (
    <>
      {pivots.map((pivot) => {
        const venue = pivot.plan.location_details;
        const dateLabel = formatPivotDate(pivot.plan.date_time);
        const hasVenue = !!venue?.name && venue.name !== "No suitable venue found";
        const topic = (pivot.plan.topic ?? "").replace(/^Pivot:\s*/i, "").trim() || "your plan";
        return (
          <View key={pivot.id} style={styles.card}>
            <View style={styles.header}>
              <View style={styles.badge}>
                <Ionicons name="rainy" size={16} color={Colors.primaryViolet} />
                <Text style={styles.badgeText}>Weather alert</Text>
              </View>
              <TouchableOpacity
                onPress={() => handleDismiss(pivot)}
                hitSlop={12}
                style={styles.dismissBtn}
                accessibilityLabel="Dismiss weather alert"
              >
                <Ionicons name="close" size={22} color={Colors.gray500} />
              </TouchableOpacity>
            </View>

            <Text style={styles.title}>
              The weather looks rough for {topic}
              {dateLabel ? ` on ${dateLabel}` : ""}.
            </Text>
            {hasVenue ? (
              <Text style={styles.body}>
                We found an indoor alternative: <Text style={styles.venue}>{venue?.name}</Text>
                {venue?.address ? ` · ${venue.address}` : ""}.
              </Text>
            ) : (
              <Text style={styles.body}>We can switch this to an indoor-friendly plan.</Text>
            )}

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btn, styles.btnGhost]}
                onPress={() => handleDismiss(pivot)}
                activeOpacity={0.85}
                disabled={busyId === pivot.id}
              >
                <Text style={styles.btnGhostText}>Keep original</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                onPress={() => handleAccept(pivot)}
                activeOpacity={0.9}
                disabled={busyId === pivot.id}
              >
                {busyId === pivot.id ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.btnPrimaryText}>Use indoor plan</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primaryViolet,
    borderColor: Colors.gray200,
    borderWidth: 1,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: Colors.primaryViolet + "18",
  },
  badgeText: { ...Typography.caption, fontWeight: "700", color: Colors.primaryViolet },
  dismissBtn: { padding: 4 },
  title: { ...Typography.body, fontWeight: "700", color: Colors.textPrimary, marginBottom: 6 },
  body: { ...Typography.caption, color: Colors.gray600, marginBottom: 14 },
  venue: { fontWeight: "700", color: Colors.textPrimary },
  actions: { flexDirection: "row", gap: 10 },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 12,
  },
  btnGhost: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200 },
  btnGhostText: { ...Typography.button, color: Colors.gray600 },
  btnPrimary: { backgroundColor: Colors.primaryViolet },
  btnPrimaryText: { ...Typography.button, color: Colors.white },
});
