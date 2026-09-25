/**
 * Concierge Quick plan — free-text request → structured venue options.
 * City is required; optional radius + map pin bias venue search.
 */

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useTranslation } from "react-i18next";
import { GestureScrollView } from "@/components/ui/GestureScrollView";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { PrimaryButton, TextButton } from "@/components/ds";
import {
  PlanningLocationFields,
  type PlanningLocationValue,
} from "@/components/ai/PlanningLocationFields";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";

export type ConciergeQuickRequestStepProps = {
  initialQuery?: string;
  location: PlanningLocationValue;
  onLocationChange: (next: PlanningLocationValue) => void;
  language?: string;
  onGenerate: (query: string) => void;
  onBack: () => void;
  showInlineBack?: boolean;
  generating?: boolean;
};

const EXAMPLE_KEYS = ["concierge.quick.example.1", "concierge.quick.example.2", "concierge.quick.example.3"];

export function ConciergeQuickRequestStep({
  initialQuery = "",
  location,
  onLocationChange,
  language = "en",
  onGenerate,
  onBack,
  showInlineBack = true,
  generating = false,
}: ConciergeQuickRequestStepProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [query, setQuery] = useState(initialQuery);

  const cityReady = useMemo(() => {
    const line = normalizeLocationDisplayString(location.location ?? "", language).trim();
    return line.length >= 2;
  }, [location.location, language]);

  const submit = () => {
    const q = query.trim();
    if (!q || !cityReady || generating) return;
    Haptics.selectionAsync();
    onGenerate(q);
  };

  return (
    <GestureScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {showInlineBack ? (
        <TextButton
          title={t("common.back")}
          icon={<Ionicons name="arrow-back" size={20} color={theme.colors.primary} />}
          onPress={onBack}
          style={styles.backRow}
        />
      ) : null}

      <View style={styles.pill}>
        <Ionicons name="flash" size={16} color={theme.colors.primary} />
        <Text style={styles.pillText}>{t("concierge.catalog.quick_plan")}</Text>
      </View>

      <Text style={styles.title}>{t("concierge.quick.title")}</Text>
      <Text style={styles.subtitle}>
        {location.searchRadiusKm
          ? t("concierge.quick.subtitleRadius", { km: location.searchRadiusKm })
          : t("concierge.quick.subtitle")}
      </Text>

      <PlanningLocationFields
        value={location}
        onChange={onLocationChange}
        language={language}
        compact
      />

      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder={t("concierge.quick.placeholder")}
        placeholderTextColor={theme.colors.textMuted}
        multiline
        textAlignVertical="top"
        editable={!generating}
        accessibilityLabel={t("concierge.quick.inputA11y")}
      />

      <View style={styles.examples}>
        {EXAMPLE_KEYS.map((key) => t(key)).map((ex) => (
          <TouchableOpacity
            key={ex}
            style={styles.exampleChip}
            onPress={() => {
              Haptics.selectionAsync();
              setQuery(ex);
            }}
            disabled={generating}
            activeOpacity={0.85}
          >
            <Text style={styles.exampleText} numberOfLines={2}>{ex}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!cityReady ? (
        <Text style={styles.needCity}>{t("concierge.quick.needCity")}</Text>
      ) : null}

      <PrimaryButton
        title={t("concierge.quick.findOptions")}
        onPress={submit}
        loading={generating}
        disabled={!query.trim() || !cityReady}
        icon={<Ionicons name="search" size={20} color={theme.colors.onPrimary} />}
      />
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
    pill: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
      backgroundColor: theme.colors.backgroundMuted,
      borderRadius: theme.radii.pill,
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.md,
      marginBottom: theme.spacing.md,
    },
    pillText: {
      ...theme.type.caption,
      fontWeight: "700",
      color: theme.colors.primary,
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
      marginBottom: theme.spacing.lg,
      lineHeight: 22,
    },
    input: {
      minHeight: 110,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      padding: theme.spacing.lg,
      ...theme.type.body,
      color: theme.colors.textPrimary,
      backgroundColor: theme.colors.surface,
      marginBottom: theme.spacing.md,
      marginTop: theme.spacing.sm,
    },
    examples: { gap: theme.spacing.sm, marginBottom: theme.spacing.md },
    exampleChip: {
      backgroundColor: theme.colors.backgroundMuted,
      borderRadius: theme.radii.md,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
    },
    exampleText: {
      ...theme.type.caption,
      color: theme.colors.textSecondary,
      fontWeight: "600",
    },
    needCity: {
      ...theme.type.caption,
      color: theme.colors.error,
      marginBottom: theme.spacing.sm,
      fontWeight: "600",
    },
  });
}
