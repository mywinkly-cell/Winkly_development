/**
 * 1–5 star rating — interactive when onChange is supplied, read-only otherwise.
 * Used for rating a plan after it happened and for showing a community plan's score.
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography } from "@/constants/tokens";

export type StarRatingProps = {
  /** Current value, 0–5. Fractions are rounded for display in read-only mode. */
  value: number;
  /** Omit to render read-only. */
  onChange?: (stars: number) => void;
  size?: number;
  /** e.g. 12 → "(12)" beside the stars. */
  count?: number;
  /** Shown after the stars in read-only mode, e.g. "4.6". */
  showValue?: boolean;
  label?: string;
};

const STARS = [1, 2, 3, 4, 5] as const;

export function StarRating({
  value,
  onChange,
  size = 24,
  count,
  showValue = false,
  label,
}: StarRatingProps) {
  const { t } = useTranslation();
  const readOnly = !onChange;
  const rounded = Math.round(value);

  const handlePress = (stars: number) => {
    if (!onChange) return;
    Haptics.selectionAsync();
    onChange(stars);
  };

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={styles.row}
        accessibilityRole={readOnly ? "text" : "adjustable"}
        accessibilityLabel={
          readOnly
            ? count
              ? t("planner.stars.ratedWithCount", { value: value.toFixed(1), count })
              : t("planner.stars.rated", { value: value.toFixed(1) })
            : t("planner.stars.rateA11y", { value: rounded })
        }
        accessibilityValue={readOnly ? undefined : { min: 1, max: 5, now: rounded }}
      >
        {STARS.map((n) => {
          const filled = n <= rounded;
          const star = (
            <Ionicons
              name={filled ? "star" : "star-outline"}
              size={size}
              color={filled ? Colors.accentYellow : Colors.gray400}
            />
          );

          if (readOnly) return <View key={n} style={styles.star}>{star}</View>;

          return (
            <TouchableOpacity
              key={n}
              onPress={() => handlePress(n)}
              hitSlop={6}
              style={styles.star}
              accessibilityRole="button"
              accessibilityLabel={t("planner.stars.star", { count: n })}
              accessibilityState={{ selected: filled }}
            >
              {star}
            </TouchableOpacity>
          );
        })}

        {showValue && value > 0 ? (
          <Text style={styles.value}>{value.toFixed(1)}</Text>
        ) : null}
        {typeof count === "number" && count > 0 ? (
          <Text style={styles.count}>({count})</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: {
    ...Typography.caption,
    color: Colors.gray600,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  star: {
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  value: {
    ...Typography.caption,
    color: Colors.textPrimary,
    fontWeight: "600",
    marginLeft: 6,
  },
  count: {
    ...Typography.caption,
    color: Colors.gray600,
    marginLeft: 4,
  },
});
