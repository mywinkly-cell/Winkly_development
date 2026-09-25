// ────────────────────────────────────────────────
// Winkly — Location precision (Privacy & Safety)
// Choose how precisely your location is used for discovery distance.
// Raw GPS is never stored; coordinates are snapped to a grid server-side.
// ────────────────────────────────────────────────

import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { SafeScreenView } from "@/components/SafeScreenView";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import {
  getLocationPrecision,
  setLocationPrecision,
  type LocationPrecision,
} from "@/lib/location";
import { formatApproxDistance } from "@/lib/distanceUnit";
import { useAppLocaleTag } from "@/lib/i18n/appLocale";

type Option = {
  value: LocationPrecision;
  icon: keyof typeof Ionicons.glyphMap;
  /** Grid size the server snaps coordinates to for this option, in meters. */
  gridMeters: number;
};

const OPTIONS: Option[] = [
  { value: "approximate", icon: "shield-checkmark-outline", gridMeters: 1000 },
  { value: "precise", icon: "navigate-outline", gridMeters: 100 },
];

export default function LocationPrivacy() {
  const { t } = useTranslation();
  const localeTag = useAppLocaleTag();
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
        <Text style={styles.headerTitle}>{t("account.location.title")}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          {t("account.location.intro")}
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
                      <Text style={styles.rowTitle}>{t(`account.location.${opt.value}.title`)}</Text>
                      <Text style={styles.rowSubtitle}>
                        {t(`account.location.${opt.value}.subtitle`, {
                          size: formatApproxDistance(opt.gridMeters, undefined, localeTag),
                        })}
                      </Text>
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
          {t("account.location.footnote")}
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
