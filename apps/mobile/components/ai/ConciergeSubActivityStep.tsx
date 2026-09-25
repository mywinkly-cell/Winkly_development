import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { GestureScrollView } from "@/components/ui/GestureScrollView";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { TextButton } from "@/components/ds";
import { useTranslation } from "react-i18next";
import { SUB_ACTIVITY_META, type ActivityCategory } from "@/lib/ai/conciergePlanningFlow";
import { translateCatalogText } from "@/lib/ai/conciergeCatalogI18n";

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

function getSubActivityMeta(label: string, category: ActivityCategory) {
  return SUB_ACTIVITY_META[label] ?? { icon: category.icon, hint: undefined };
}

function buildOptionKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function ConciergeSubActivityStep({
  category,
  onContinue,
  onBack,
  showInlineBack = true,
}: ConciergeSubActivityStepProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const options = useMemo(() => {
    const list = category.subActivities ?? [];
    if (!list.length) {
      return [{ key: "any", label: "Any" }];
    }
    return list.map((label) => ({
      key: buildOptionKey(label),
      label,
    }));
  }, [category.subActivities]);

  const categoryLabel = translateCatalogText(t, category.label);
  const prompt = category.subActivityPrompt?.trim()
    ? translateCatalogText(t, category.subActivityPrompt.trim())
    : t("concierge.sub.whatKind", { category: categoryLabel });

  const handleSelect = (opt: { key: string; label: string }) => {
    Haptics.selectionAsync();
    onContinue({ subKey: opt.key, subLabel: opt.label });
  };

  return (
    <GestureScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {showInlineBack ? (
        <TextButton
          title={t("common.back")}
          icon={<Ionicons name="arrow-back" size={20} color={theme.colors.primary} />}
          onPress={onBack}
          style={styles.backRow}
        />
      ) : null}

      <View style={styles.categoryPill}>
        <View style={styles.categoryIconWrap}>
          <Ionicons name={category.icon as never} size={18} color={theme.colors.primary} />
        </View>
        <Text style={styles.categoryPillText} numberOfLines={1}>
          {categoryLabel}
        </Text>
      </View>

      <Text style={styles.title} numberOfLines={3}>
        {prompt}
      </Text>
      <Text style={styles.subtitle}>{t("concierge.sub.pickVibe")}</Text>

      <View style={styles.grid}>
        {options.map((opt) => {
          const meta = getSubActivityMeta(opt.label, category);
          const label = translateCatalogText(t, opt.label);
          const hint = meta.hint ? translateCatalogText(t, meta.hint) : undefined;
          return (
            <TouchableOpacity
              key={opt.key}
              style={styles.gridCard}
              onPress={() => handleSelect(opt)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityHint={hint}
            >
              <View style={styles.gridIconWrap}>
                <Ionicons name={meta.icon as never} size={26} color={theme.colors.primary} />
              </View>
              <Text style={styles.gridLabel} numberOfLines={3}>
                {label}
              </Text>
              {hint ? (
                <Text style={styles.gridHint} numberOfLines={2}>
                  {hint}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </GestureScrollView>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    content: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.xxl,
      paddingTop: theme.spacing.xs,
    },
    backRow: { alignSelf: "flex-start", marginBottom: theme.spacing.lg, paddingLeft: 0 },
    categoryPill: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.pill,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      marginBottom: theme.spacing.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...theme.elevation(1),
    },
    categoryIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    categoryPillText: {
      ...theme.type.caption,
      fontWeight: "700",
      color: theme.colors.primary,
      maxWidth: 220,
    },
    title: {
      ...theme.type.h1,
      fontSize: 26,
      lineHeight: 32,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.sm,
    },
    subtitle: {
      ...theme.type.body,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.xl,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.md,
    },
    gridCard: {
      width: "47.5%",
      flexGrow: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.lg,
      padding: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      minHeight: 118,
      ...theme.elevation(1),
    },
    gridIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.spacing.sm,
    },
    gridLabel: {
      ...theme.type.body,
      fontWeight: "700",
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.xs,
    },
    gridHint: {
      ...theme.type.caption,
      color: theme.colors.textSecondary,
      lineHeight: 16,
    },
  });
}
