import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { GestureScrollView } from "@/components/ui/GestureScrollView";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout, Shadow } from "@/constants/tokens";
import type { ActivityCategory } from "@/lib/ai/conciergePlanningFlow";

export type SubActivityContinuePayload = {
  subKey: string;
  subLabel: string;
};

export type ConciergeSubActivityStepProps = {
  category: ActivityCategory;
  onContinue: (payload: SubActivityContinuePayload) => void;
  onBack: () => void;
  /** When false, parent shows the back control (e.g. flow header). */
  showInlineBack?: boolean;
};

export function ConciergeSubActivityStep({
  category,
  onContinue,
  onBack,
  showInlineBack = true,
}: ConciergeSubActivityStepProps) {
  const options = useMemo(() => {
    const list = category.subActivities ?? [];
    if (!list.length) return [{ key: "any", label: "Any" }];
    return list.map((label) => ({
      key:
        label === "Surprise me"
          ? category.key === "food_drinks"
            ? "surprise_me"
            : "any"
          : label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
      label,
    }));
  }, [category.subActivities]);

  const prompt = category.subActivityPrompt?.trim() || `What kind of ${category.label.toLowerCase()}?`;

  return (
    <GestureScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {showInlineBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backRow} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color={Colors.primaryViolet} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.heroCard}>
        <Text style={styles.heroTitle} numberOfLines={2}>
          {prompt}
        </Text>
        <Text style={styles.subtitle}>Choose one option</Text>
      </View>

      <View style={styles.list}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={styles.optionCard}
            onPress={() => {
              Haptics.selectionAsync();
              onContinue({ subKey: opt.key, subLabel: opt.label });
            }}
            activeOpacity={0.9}
          >
            <Text style={styles.optionText} numberOfLines={2}>
              {opt.label}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.gray500} />
          </TouchableOpacity>
        ))}
      </View>
    </GestureScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.backgroundMuted },
  content: { paddingHorizontal: Layout.spacing.xl, paddingBottom: Layout.spacing.xxl, paddingTop: 14 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "600" },
  heroCard: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.gray200,
    marginBottom: 14,
    ...Shadow.card,
  },
  heroTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 6 },
  subtitle: { ...Typography.caption, color: Colors.gray600 },
  list: { gap: 10 },
  optionCard: {
    width: "100%",
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.gray200,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    ...Shadow.card,
  },
  optionText: { ...Typography.body, fontWeight: "600", color: Colors.textPrimary, flex: 1 },
});

