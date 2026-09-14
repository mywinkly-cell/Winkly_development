// Business Mode – Filtering screen
// Premium styling aligned with Romance & Friends filters

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { BusinessBottomNav } from "@/components/layout/BusinessBottomNav";
import { Card, Chip, Header, PrimaryButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import {
  LANGUAGE_OPTIONS,
  INDUSTRY_OPTIONS,
  ROLE_OPTIONS,
  NETWORKING_GOALS_OPTIONS,
  INTEREST_POPULAR_BUSINESS,
} from "@/constants/profileOptions";
import { getBusinessFilters, setBusinessFilters } from "@/lib/filters/businessFiltersStorage";

const DISTANCE_OPTIONS_KM = [5, 10, 25, 50, 100, 999] as const;

export default function BusinessFiltersScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  const [distanceKm, setDistanceKm] = useState<number>(50);
  const [languages, setLanguages] = useState<string[]>(["Any"]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [networkingGoals, setNetworkingGoals] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await getBusinessFilters();
      if (cancelled) return;
      setDistanceKm(saved.distanceKm);
      setLanguages(saved.languages.length ? saved.languages : ["Any"]);
      setIndustries(saved.industries);
      setRoles(saved.roles);
      setNetworkingGoals(saved.networkingGoals);
      setInterests(saved.interests);
    })();
    return () => { cancelled = true; };
  }, []);

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

  const handleApply = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await setBusinessFilters({
      distanceKm,
      languages,
      industries,
      roles,
      networkingGoals,
      interests,
    });
    router.back();
  };

  return (
    <View style={styles.container}>
      <Header title="Filtering" onBack={() => router.back()} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Basic filters</Text>
          <Text style={styles.sectionHint}>Distance and language</Text>

          <Text style={styles.label}>Distance (max km)</Text>
          <View style={styles.chipRowWrap}>
            {DISTANCE_OPTIONS_KM.map((km) => (
              <Chip
                key={km}
                label={km === 999 ? "Any" : `${km} km`}
                mode="business"
                selected={distanceKm === km}
                onPress={() => {
                  Haptics.selectionAsync();
                  setDistanceKm(km);
                }}
              />
            ))}
          </View>

          <Text style={styles.label}>Language</Text>
          <View style={styles.chipRowWrap}>
            {LANGUAGE_OPTIONS.slice(0, 8).map((lang) => {
              const selected = languages.includes(lang) || (languages.includes("Any") && lang === "Any");
              return (
                <Chip key={lang} label={lang} mode="business" selected={selected} onPress={() => toggleLanguage(lang)} />
              );
            })}
          </View>
        </Card>

        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Professional</Text>
          <Text style={styles.sectionHint}>Industry, role, and goals</Text>

          <Text style={styles.label}>Industry (up to 3)</Text>
          <View style={styles.chipRowWrap}>
            {INDUSTRY_OPTIONS.map((i) => (
              <Chip key={i} label={i} mode="business" selected={industries.includes(i)} onPress={() => toggleChip(industries, i, setIndustries, 3)} />
            ))}
          </View>

          <Text style={styles.label}>Role (up to 2)</Text>
          <View style={styles.chipRowWrap}>
            {ROLE_OPTIONS.map((r) => (
              <Chip key={r} label={r} mode="business" selected={roles.includes(r)} onPress={() => toggleChip(roles, r, setRoles, 2)} />
            ))}
          </View>

          <Text style={styles.label}>Networking goals (up to 3)</Text>
          <View style={styles.chipRowWrap}>
            {NETWORKING_GOALS_OPTIONS.map((g) => (
              <Chip key={g} label={g} mode="business" selected={networkingGoals.includes(g)} onPress={() => toggleChip(networkingGoals, g, setNetworkingGoals, 3)} />
            ))}
          </View>

          <Text style={styles.label}>Interests (up to 4)</Text>
          <View style={styles.chipRowWrap}>
            {INTEREST_POPULAR_BUSINESS.map((i) => (
              <Chip key={i} label={i} mode="business" selected={interests.includes(i)} onPress={() => toggleChip(interests, i, setInterests, 4)} />
            ))}
          </View>
        </Card>

        <PrimaryButton
          title="Apply filters"
          onPress={handleApply}
          style={{ backgroundColor: theme.modeAccent("business").primary }}
        />
        <View style={{ height: theme.spacing.huge }} />
      </ScrollView>
      <BusinessBottomNav />
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.backgroundMuted },
    scroll: { flex: 1 },
    scrollContent: { padding: theme.spacing.xl, paddingTop: theme.spacing.xl, paddingBottom: theme.spacing.xxl },
    sectionCard: { marginBottom: theme.spacing.xxl },
    sectionTitle: {
      ...theme.type.h3,
      fontFamily: theme.type.h3.fontFamily,
      color: theme.colors.textPrimary,
    },
    sectionHint: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.lg,
    },
    label: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      fontWeight: "600",
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.sm,
    },
    chipRowWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
  });
}
