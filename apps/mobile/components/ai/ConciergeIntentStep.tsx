/**
 * Step 1 — Intent: category-first cards (ranked in mode context; full catalogue grouped by mode from Planner Events tab).
 */

import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import type { Mode } from "@/types";
import { getCategoriesForMode } from "@/lib/ai/conciergePlanningFlow";
import type { RankedCategory } from "@/lib/ai/rankActivityCategories";

export type IntentContinuePayload = {
  key: string;
  label: string;
  /** Planning mode for the rest of the flow (generic catalogue picks parent section). */
  flowMode: Mode;
};

export type ConciergeIntentStepProps = {
  mode: Mode;
  categories: RankedCategory[];
  /** Events planner tab: show every mode’s categories in grouped sections (no ranking). */
  genericCatalog: boolean;
  onContinue: (payload: IntentContinuePayload) => void;
};

const MODE_LABEL: Record<Mode, string> = {
  romance: "Romance",
  friends: "Friends",
  business: "Business",
  events: "Events",
};

const MODE_BORDER: Record<Mode, string> = {
  romance: Colors.romance.primary,
  friends: Colors.friends.primary,
  business: Colors.business.primary,
  events: Colors.events.primary,
};

const MODE_SECTION_ORDER: Mode[] = ["romance", "friends", "business", "events"];

export function ConciergeIntentStep({
  mode,
  categories,
  genericCatalog,
  onContinue,
}: ConciergeIntentStepProps) {
  const sections = useMemo(() => {
    if (!genericCatalog) return null;
    return MODE_SECTION_ORDER.map((m) => ({
      mode: m,
      label: MODE_LABEL[m],
      border: MODE_BORDER[m],
      items: getCategoriesForMode(m).map((c) => ({ ...c, boosted: false as const })),
    })).filter((s) => s.items.length > 0);
  }, [genericCatalog]);

  const singleList = useMemo(() => {
    if (genericCatalog) return null;
    const custom = categories.find((b) => b.key === "custom");
    const rest = categories.filter((b) => b.key !== "custom");
    return [...(custom ? [custom] : []), ...rest];
  }, [categories, genericCatalog]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>What would you like to plan?</Text>

      {genericCatalog && sections ? (
        <>
          {sections.map((section) => (
            <View key={section.mode} style={[styles.modeSection, { borderLeftColor: section.border }]}>
              <Text style={styles.modeSectionTitle}>{section.label}</Text>
              <View style={styles.grid}>
                {section.items.map((item) => (
                  <CategoryButton
                    key={`${section.mode}-${item.key}`}
                    item={item}
                    onPress={() => {
                      Haptics.selectionAsync();
                      onContinue({
                        key: item.key,
                        label: item.label,
                        flowMode: section.mode,
                      });
                    }}
                  />
                ))}
              </View>
            </View>
          ))}
        </>
      ) : (
        singleList && (
          <View style={styles.grid}>
            {singleList.map((item) => (
              <CategoryButton
                key={item.key}
                item={item}
                onPress={() => {
                  Haptics.selectionAsync();
                  onContinue({
                    key: item.key,
                    label: item.label,
                    flowMode: mode,
                  });
                }}
              />
            ))}
          </View>
        )
      )}
    </ScrollView>
  );
}

function CategoryButton({
  item,
  onPress,
}: {
  item: RankedCategory;
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
      {item.boosted && item.boostReason ? (
        <Text style={styles.boostHint} numberOfLines={2}>
          {item.boostReason}
        </Text>
      ) : null}
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
  modeSection: {
    marginBottom: 20,
    paddingLeft: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.gray300,
  },
  modeSectionTitle: {
    ...Typography.caption,
    fontWeight: "700",
    color: Colors.gray600,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 4,
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
  boostHint: {
    ...Typography.caption,
    fontSize: 11,
    color: Colors.primaryViolet,
    textAlign: "center",
    marginTop: 6,
    fontWeight: "500",
  },
});
