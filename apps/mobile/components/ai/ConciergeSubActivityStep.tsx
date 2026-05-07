import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import type { ActivityCategory } from "@/lib/ai/conciergePlanningFlow";

export type SubActivityContinuePayload = {
  subKey: string;
  subLabel: string;
};

export type ConciergeSubActivityStepProps = {
  category: ActivityCategory;
  onContinue: (payload: SubActivityContinuePayload) => void;
  onBack: () => void;
};

export function ConciergeSubActivityStep({ category, onContinue, onBack }: ConciergeSubActivityStepProps) {
  const options = useMemo(() => {
    const list = category.subActivities ?? [];
    if (!list.length) return [{ key: "any", label: "Any" }];
    return list.map((label) => ({
      key: label === "Surprise me" ? "any" : label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
      label,
    }));
  }, [category.subActivities]);

  const prompt = category.subActivityPrompt?.trim() || `What kind of ${category.label.toLowerCase()}?`;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <TouchableOpacity onPress={onBack} style={styles.backRow} activeOpacity={0.8}>
        <Ionicons name="arrow-back" size={22} color={Colors.primaryViolet} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{prompt}</Text>
      <View style={styles.wrap}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={styles.chip}
            onPress={() => {
              Haptics.selectionAsync();
              onContinue({ subKey: opt.key, subLabel: opt.label });
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.chipText}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: Layout.spacing.xl, paddingBottom: Layout.spacing.xxl },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "600" },
  title: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 14 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    backgroundColor: Colors.gray100,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  chipText: { ...Typography.caption, color: Colors.textPrimary, fontWeight: "600" },
});

