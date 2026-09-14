// ────────────────────────────────────────────────
// Winkly — Location precision (Privacy & Safety)
// Choose how precisely your location is used for discovery distance.
// Raw GPS is never stored; coordinates are snapped to a grid server-side.
// ────────────────────────────────────────────────

import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { SafeScreenView } from "@/components/SafeScreenView";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import {
  getLocationPrecision,
  setLocationPrecision,
  type LocationPrecision,
} from "@/lib/location";

type Option = {
  value: LocationPrecision;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const OPTIONS: Option[] = [
  {
    value: "approximate",
    title: "Approximate",
    subtitle:
      "Recommended. Your location is rounded to roughly a 1 km area before it’s stored — enough for distance matching, but it never reveals where you actually are.",
    icon: "shield-checkmark-outline",
  },
  {
    value: "precise",
    title: "Precise",
    subtitle:
      "More accurate distances. Your location is still rounded (to about 100 m) and your exact GPS position is never stored or shared with anyone.",
    icon: "navigate-outline",
  },
];

export default function LocationPrivacy() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const [precision, setPrecision] = React.useState<LocationPrecision | null>(null);
  const [saving, setSaving] = React.useState<LocationPrecision | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    (async () => {
      const current = await getLocationPrecision();
      if (active) {
        setPrecision(current);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const onSelect = async (value: LocationPrecision) => {
    if (value === precision || saving) return;
    Haptics.selectionAsync();
    setSaving(value);
    const prev = precision;
    setPrecision(value);
    const res = await setLocationPrecision(value);
    if (!res.ok) {
      setPrecision(prev);
    } else {
      setPrecision(res.precision);
    }
    setSaving(null);
  };

  return (
    <SafeScreenView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Location precision</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Winkly uses your location to show how far away people are. Choose how precise that is. Either way, your raw
          GPS position is never stored, and other people only ever see a rounded distance — never your coordinates.
        </Text>

        <View style={styles.card}>
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : (
            OPTIONS.map((opt, idx) => {
              const selected = precision === opt.value;
              return (
                <React.Fragment key={opt.value}>
                  {idx > 0 && <View style={styles.divider} />}
                  <TouchableOpacity
                    onPress={() => onSelect(opt.value)}
                    style={styles.row}
                    activeOpacity={0.7}
                    disabled={saving !== null}
                  >
                    <View style={[styles.iconWrap, selected && styles.iconWrapSelected]}>
                      <Ionicons
                        name={opt.icon}
                        size={20}
                        color={selected ? theme.colors.onPrimary : theme.colors.primary}
                      />
                    </View>
                    <View style={styles.rowContent}>
                      <Text style={styles.rowTitle}>{opt.title}</Text>
                      <Text style={styles.rowSubtitle}>{opt.subtitle}</Text>
                    </View>
                    {saving === opt.value ? (
                      <ActivityIndicator color={theme.colors.primary} />
                    ) : (
                      <Ionicons
                        name={selected ? "radio-button-on" : "radio-button-off"}
                        size={22}
                        color={selected ? theme.colors.primary : theme.colors.textMuted}
                      />
                    )}
                  </TouchableOpacity>
                </React.Fragment>
              );
            })
          )}
        </View>

        <Text style={styles.footnote}>
          Switching to Approximate takes effect immediately. Switching to Precise applies the next time your location
          refreshes.
        </Text>
      </ScrollView>
    </SafeScreenView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.backgroundMuted },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.md,
      minHeight: 56,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      justifyContent: "center",
      ...theme.elevation(1),
    },
    headerTitle: { ...theme.type.h2, fontFamily: theme.type.h1.fontFamily, color: theme.colors.textPrimary },
    placeholder: { width: 40 },
    scroll: { padding: theme.spacing.xl, paddingBottom: 40 },
    intro: {
      ...theme.type.body,
      color: theme.colors.textSecondary,
      lineHeight: 22,
      marginBottom: 16,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.lg,
      padding: 20,
    },
    loadingWrap: { paddingVertical: 24, alignItems: "center" },
    row: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: theme.colors.primary + "15",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 14,
    },
    iconWrapSelected: { backgroundColor: theme.colors.primary },
    rowContent: { flex: 1, paddingRight: 12 },
    rowTitle: { ...theme.type.body, fontWeight: "600", color: theme.colors.textPrimary },
    rowSubtitle: { ...theme.type.caption, color: theme.colors.textSecondary, marginTop: 4, lineHeight: 18 },
    divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 4 },
    footnote: {
      ...theme.type.caption,
      color: theme.colors.textSecondary,
      lineHeight: 18,
      marginTop: 16,
      paddingHorizontal: 4,
    },
  });
}
