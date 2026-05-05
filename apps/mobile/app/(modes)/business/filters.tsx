// Business Mode – Filtering screen
// Premium styling aligned with Romance & Friends filters

import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { ModeBottomBar } from "@/components/layout/ModeBottomBar";
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";
import {
  LANGUAGE_OPTIONS,
  INDUSTRY_OPTIONS,
  ROLE_OPTIONS,
  NETWORKING_GOALS_OPTIONS,
  INTEREST_POPULAR_BUSINESS,
} from "@/constants/profileOptions";

const DISTANCE_OPTIONS_KM = [5, 10, 25, 50, 100, 999] as const;

export default function BusinessFiltersScreen() {
  const router = useRouter();

  const [distanceKm, setDistanceKm] = useState<number>(50);
  const [languages, setLanguages] = useState<string[]>(["Any"]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [networkingGoals, setNetworkingGoals] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);

  const toggleLanguage = (lang: string) => {
    Haptics.selectionAsync();
    if (lang === "Any") {
      setLanguages(["Any"]);
      return;
    }
    setLanguages((prev) => {
      const next = prev.filter((l) => l !== "Any");
      if (next.includes(lang)) return next.length ? next : ["Any"];
      return [...next, lang].length ? [...next, lang] : ["Any"];
    });
  };

  const toggleChip = (arr: string[], val: string, setter: (v: string[]) => void, max: number) => {
    Haptics.selectionAsync();
    if (arr.includes(val)) {
      setter(arr.filter((x) => x !== val));
    } else if (arr.length < max) {
      setter([...arr, val]);
    }
  };

  const handleApply = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // TODO: persist filters and apply to discover feed
    router.back();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.9}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Filtering</Text>
        <View style={styles.headerRight} />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Basic filters</Text>
          <Text style={styles.sectionHint}>Distance and language</Text>

          <Text style={styles.label}>Distance (max km)</Text>
          <View style={styles.chipRow}>
            {DISTANCE_OPTIONS_KM.map((km) => (
              <Pressable
                key={km}
                onPress={() => {
                  Haptics.selectionAsync();
                  setDistanceKm(km);
                }}
                style={[styles.chip, distanceKm === km && styles.chipSelected]}
              >
                <Text style={[styles.chipText, distanceKm === km && styles.chipTextSelected]}>
                  {km === 999 ? "Any" : `${km} km`}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Language</Text>
          <View style={styles.chipRowWrap}>
            {LANGUAGE_OPTIONS.slice(0, 8).map((lang) => {
              const selected = languages.includes(lang) || (languages.includes("Any") && lang === "Any");
              return (
                <Pressable
                  key={lang}
                  onPress={() => toggleLanguage(lang)}
                  style={[styles.chipSmall, selected && styles.chipSelected]}
                >
                  <Text style={[styles.chipTextSmall, selected && styles.chipTextSelected]}>{lang}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Professional</Text>
          <Text style={styles.sectionHint}>Industry, role, and goals</Text>

          <Text style={styles.label}>Industry (up to 3)</Text>
          <View style={styles.chipRowWrap}>
            {INDUSTRY_OPTIONS.map((i) => (
              <Pressable
                key={i}
                onPress={() => toggleChip(industries, i, setIndustries, 3)}
                style={[styles.chipSmall, industries.includes(i) && styles.chipSelected]}
              >
                <Text style={[styles.chipTextSmall, industries.includes(i) && styles.chipTextSelected]}>{i}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Role (up to 2)</Text>
          <View style={styles.chipRowWrap}>
            {ROLE_OPTIONS.map((r) => (
              <Pressable
                key={r}
                onPress={() => toggleChip(roles, r, setRoles, 2)}
                style={[styles.chipSmall, roles.includes(r) && styles.chipSelected]}
              >
                <Text style={[styles.chipTextSmall, roles.includes(r) && styles.chipTextSelected]}>{r}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Networking goals (up to 3)</Text>
          <View style={styles.chipRowWrap}>
            {NETWORKING_GOALS_OPTIONS.map((g) => (
              <Pressable
                key={g}
                onPress={() => toggleChip(networkingGoals, g, setNetworkingGoals, 3)}
                style={[styles.chipSmall, networkingGoals.includes(g) && styles.chipSelected]}
              >
                <Text style={[styles.chipTextSmall, networkingGoals.includes(g) && styles.chipTextSelected]}>
                  {g}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Interests (up to 4)</Text>
          <View style={styles.chipRowWrap}>
            {INTEREST_POPULAR_BUSINESS.map((i) => (
              <Pressable
                key={i}
                onPress={() => toggleChip(interests, i, setInterests, 4)}
                style={[styles.chipSmall, interests.includes(i) && styles.chipSelected]}
              >
                <Text style={[styles.chipTextSmall, interests.includes(i) && styles.chipTextSelected]}>{i}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable onPress={handleApply} style={styles.applyBtn} android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
          <Text style={styles.applyBtnText}>Apply filters</Text>
        </Pressable>
        <View style={{ height: 40 }} />
      </ScrollView>
      <ModeBottomBar mode="business" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundMuted },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    minHeight: 56,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...Typography.h3,
    fontFamily: FontFamily.heading,
    color: Colors.textPrimary,
  },
  headerRight: { width: 44 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 20, paddingBottom: 24 },
  sectionCard: {
    marginBottom: 24,
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    padding: 20,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  sectionTitle: {
    ...Typography.h3,
    fontSize: 18,
    fontFamily: FontFamily.heading,
    color: Colors.textPrimary,
  },
  sectionHint: {
    ...Typography.caption,
    color: Colors.gray600,
    marginBottom: 16,
    lineHeight: 20,
  },
  label: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.gray700,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 18,
  },
  chipRowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  chip: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
  },
  chipSmall: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: Colors.gray100,
  },
  chipSelected: {
    backgroundColor: Colors.business.primary,
  },
  chipText: {
    ...Typography.caption,
    color: Colors.textPrimary,
    fontWeight: "500",
  },
  chipTextSmall: {
    ...Typography.caption,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  chipTextSelected: {
    color: Colors.white,
  },
  applyBtn: {
    paddingVertical: 18,
    borderRadius: 16,
    backgroundColor: Colors.business.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.business.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  applyBtnText: {
    ...Typography.button,
    fontFamily: FontFamily.heading,
    color: Colors.white,
    fontSize: 17,
  },
});
