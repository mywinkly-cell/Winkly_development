/**
 * Step 1 — Intent: pick a topic card, then continue.
 * Optional text + profile chips are on the next step (activity details) with location, date, time, budget.
 */

import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import type { Mode } from "@/types";
import {
  getActivityButtonsForMode,
  type ActivityButtonDef,
} from "@/lib/ai/conciergePlanningFlow";

export type IntentContinuePayload = {
  key: string;
  label: string;
};

export type ConciergeIntentStepProps = {
  mode: Mode;
  onContinue: (payload: IntentContinuePayload) => void;
};

export function ConciergeIntentStep({ mode, onContinue }: ConciergeIntentStepProps) {
  const buttons = useMemo(() => getActivityButtonsForMode(mode), [mode]);
  const orderedButtons = useMemo(() => {
    const custom = buttons.find((b) => b.key === "custom");
    const rest = buttons.filter((b) => b.key !== "custom");
    return [...(custom ? [custom] : []), ...rest];
  }, [buttons]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>What would you like to plan?</Text>

      <View style={styles.grid}>
        {orderedButtons.map((item) => (
          <ActivityButton
            key={item.key}
            item={item}
            onPress={() => {
              Haptics.selectionAsync();
              const next = { key: item.key, label: item.label };
              onContinue({
                ...next,
              });
            }}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function ActivityButton({
  item,
  onPress,
}: {
  item: ActivityButtonDef;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.button]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityLabel={item.label}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={item.icon as never} size={28} color={Colors.primaryViolet} />
      </View>
      <Text style={styles.buttonLabel} numberOfLines={2}>
        {item.label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: Layout.spacing.xl,
    paddingBottom: Layout.spacing.xxl,
  },
  title: {
    ...Typography.h3,
    fontFamily: "Poppins_600SemiBold",
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  button: {
    width: "47%",
    minWidth: 140,
    backgroundColor: Colors.white,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.gray200,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  buttonLabel: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.textPrimary,
    textAlign: "center",
  },
});
