/**
 * DiscoverModeToggle — the segmented control that makes "Top 3 for you" the
 * landing state and the full scroll list a deliberate "See all" choice.
 *
 * One control, one style — reused on every discover surface (romance, friends,
 * business, events) so the choice-reduction affordance is consistent.
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { Colors, Typography, Layout } from "@/constants/tokens";

export type DiscoverViewMode = "top" | "all";

type Props = {
  value: DiscoverViewMode;
  onChange: (mode: DiscoverViewMode) => void;
  /** Accent color for the active segment (mode color). */
  primaryColor: string;
  /** Label for the full-list segment, e.g. "See all" or "All events". */
  allLabel?: string;
  /** Optional count shown on the "See all" segment, e.g. 42. */
  allCount?: number;
};

export function DiscoverModeToggle({
  value,
  onChange,
  primaryColor,
  allLabel = "See all",
  allCount,
}: Props) {
  const topActive = value === "top";
  const allText = allCount != null ? `${allLabel} (${allCount})` : allLabel;
  return (
    <View style={styles.wrap} accessibilityRole="tablist">
      <TouchableOpacity
        onPress={() => onChange("top")}
        activeOpacity={0.9}
        style={[styles.segment, topActive && { backgroundColor: primaryColor }]}
        accessibilityRole="tab"
        accessibilityState={{ selected: topActive }}
        accessibilityLabel="Top 3 for you"
      >
        <SparklesIcon size={14} color={topActive ? Colors.white : primaryColor} />
        <Text style={[styles.segmentText, { color: topActive ? Colors.white : Colors.text }]}>
          Top 3 for you
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => onChange("all")}
        activeOpacity={0.9}
        style={[styles.segment, !topActive && { backgroundColor: primaryColor }]}
        accessibilityRole="tab"
        accessibilityState={{ selected: !topActive }}
        accessibilityLabel={allText}
      >
        <Text style={[styles.segmentText, { color: !topActive ? Colors.white : Colors.text }]}>
          {allText}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: Colors.gray100,
    borderRadius: 999,
    padding: 4,
    marginHorizontal: Layout.screenPadding,
    marginBottom: 14,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 999,
  },
  segmentText: {
    ...Typography.caption,
    fontWeight: "700",
  },
});
