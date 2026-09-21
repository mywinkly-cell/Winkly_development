/**
 * One-tap "Plan something with …" banner. Copy comes from selectPlanHintCopy (lib/ai/planHint).
 */

import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import type { Mode } from "@/types";
import type { PlanHintCopy } from "@/lib/ai/planHint";

type Props = {
  copy: PlanHintCopy;
  mode: Mode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

export function PlanHintBanner({ copy, mode, onPress, style }: Props) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const accent = theme.modeAccent(mode).primary;
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.banner, pressed && styles.pressed, style]}
      accessibilityRole="button"
      accessibilityLabel={t("planHint.a11y.open", { title: copy.title })}
      accessibilityHint={copy.subtitle}
    >
      <Ionicons name="sparkles" size={20} color={accent} />
      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={1}>
          {copy.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {copy.subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={accent} />
    </Pressable>
  );
}

function makeStyles(theme: AppTheme, accent: string) {
  return StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: accent + "55",
    },
    pressed: { opacity: 0.85 },
    textWrap: { flex: 1 },
    title: {
      ...theme.type.button,
      color: theme.colors.textPrimary,
    },
    subtitle: {
      ...theme.type.caption,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.xxs,
    },
  });
}
