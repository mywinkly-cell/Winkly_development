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
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";
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
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
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
              <ActivityIndicator color={Colors.primaryViolet} />
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
                        color={selected ? Colors.white : Colors.primaryViolet}
                      />
                    </View>
                    <View style={styles.rowContent}>
                      <Text style={styles.rowTitle}>{opt.title}</Text>
                      <Text style={styles.rowSubtitle}>{opt.subtitle}</Text>
                    </View>
                    {saving === opt.value ? (
                      <ActivityIndicator color={Colors.primaryViolet} />
                    ) : (
                      <Ionicons
                        name={selected ? "radio-button-on" : "radio-button-off"}
                        size={22}
                        color={selected ? Colors.primaryViolet : Colors.gray400}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundMuted },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    ...Layout.topHeaderBar,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  headerTitle: { ...Typography.headerTitle, fontFamily: FontFamily.heading, color: Colors.textPrimary },
  placeholder: { width: 40 },
  scroll: { padding: Layout.screenPadding, paddingBottom: 40 },
  intro: {
    ...Typography.body,
    color: Colors.gray600,
    lineHeight: 22,
    marginBottom: 16,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    padding: 20,
  },
  loadingWrap: { paddingVertical: 24, alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primaryViolet + "15",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  iconWrapSelected: { backgroundColor: Colors.primaryViolet },
  rowContent: { flex: 1, paddingRight: 12 },
  rowTitle: { ...Typography.body, fontWeight: "600", color: Colors.textPrimary },
  rowSubtitle: { ...Typography.caption, color: Colors.gray600, marginTop: 4, lineHeight: 18 },
  divider: { height: 1, backgroundColor: Colors.gray200, marginVertical: 4 },
  footnote: {
    ...Typography.caption,
    color: Colors.gray600,
    lineHeight: 18,
    marginTop: 16,
    paddingHorizontal: 4,
  },
});
