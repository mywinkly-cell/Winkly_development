/**
 * Plan-it bar — the default way to get a plan: one line of text or one chip tap.
 *
 * Submitting opens the concierge in its "plan_it" entry (ConciergePlanningFlow `planItRequest`),
 * which calls winkly_plan right away and shows the inferred assumptions as editable chips.
 * The full step-by-step wizard stays reachable via "Step by step" or a long-press on send.
 */

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Chip } from "@/components/ds";
import { useOpenSurprise } from "@/components/ai/SurpriseMeButton";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import {
  PLAN_IT_EXAMPLE_COUNT,
  PLAN_IT_MAX_CHARS,
  getPlanItChips,
  normalizePlanItRequest,
  planItExampleKey,
  type PlanItChipKey,
} from "@/lib/ai/planIt";
import type { Mode } from "@/types";

/** How often the placeholder example rotates. */
const PLACEHOLDER_ROTATE_MS = 3500;

export type PlanItBarProps = {
  /** Planning mode sent to winkly_plan (the mode the bar lives in). */
  mode: Mode;
  /** Planner tab the bar sits on (analytics + where "back" returns). */
  sourcePlannerTab?: "all" | "dates" | "meetups" | "business" | "events";
  /** Opened from a person: adds a "With {name}" chip and plans with them. */
  person?: { id: string; name: string } | null;
  /** Tighter layout for screens where vertical space is scarce (mode homes with a swipe deck). */
  compact?: boolean;
  /** Override the "Step by step" target (defaults to the concierge wizard for `mode`). */
  onOpenWizard?: () => void;
  style?: StyleProp<ViewStyle>;
};

export type PlanItBarHandle = { focus: () => void };

export const PlanItBar = forwardRef<PlanItBarHandle, PlanItBarProps>(function PlanItBar(
  { mode, sourcePlannerTab, person, compact = false, onOpenWizard, style },
  ref
) {
  const theme = useAppTheme();
  const styles = useMemo(() => makeStyles(theme, compact), [theme, compact]);
  const { t } = useTranslation();
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [tick, setTick] = useState(0);
  const openSurprise = useOpenSurprise(mode);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  // Rotate the placeholder through real examples while the field is empty and idle.
  useEffect(() => {
    if (focused || text) return;
    const timer = setInterval(() => setTick((n) => n + 1), PLACEHOLDER_ROTATE_MS);
    return () => clearInterval(timer);
  }, [focused, text]);

  const personName = person?.name?.trim() || null;
  // Chips follow the clock; recomputed each render (cheap) so they stay right after long idles.
  const chips = getPlanItChips({ personName });
  const canSubmit = !!normalizePlanItRequest(text);

  // Compact bars have no title row, so the question itself joins the rotation.
  const placeholder =
    compact && tick % (PLAN_IT_EXAMPLE_COUNT + 1) === 0
      ? t("planIt.question")
      : t("planIt.placeholder", { example: t(planItExampleKey(mode, tick)) });

  const openPlanIt = (request: string) => {
    const req = normalizePlanItRequest(request);
    if (!req) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    inputRef.current?.blur();
    setText("");
    router.push({
      pathname: "/concierge",
      params: {
        source_screen: "planner",
        mode,
        ...(sourcePlannerTab ? { source_planner_tab: sourcePlannerTab } : {}),
        plan_it: req,
        ...(person ? { partner_user_id: person.id, partner_display_name: person.name } : {}),
      },
    });
  };

  const openWizard = () => {
    Haptics.selectionAsync();
    if (onOpenWizard) {
      onOpenWizard();
      return;
    }
    router.push({
      pathname: "/concierge",
      params: {
        source_screen: "planner",
        mode,
        ...(sourcePlannerTab ? { source_planner_tab: sourcePlannerTab } : {}),
        ...(person ? { partner_user_id: person.id, partner_display_name: person.name } : {}),
      },
    });
  };

  const chipLabel = (key: PlanItChipKey) => t(`planIt.chip.${key}.label`, { name: personName ?? "" });
  const chipPrompt = (key: PlanItChipKey) => t(`planIt.chip.${key}.prompt`, { name: personName ?? "" });

  return (
    <View style={[styles.wrap, style]}>
      {compact ? null : (
        <View style={styles.titleRow}>
          <Ionicons name="sparkles" size={theme.spacing.lg} color={theme.colors.primary} />
          <Text style={styles.title}>{t("planIt.question")}</Text>
        </View>
      )}
      <View style={[styles.inputRow, focused && styles.inputRowFocused]}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textMuted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={() => openPlanIt(text)}
          returnKeyType="go"
          maxLength={PLAN_IT_MAX_CHARS}
          autoCorrect
          accessibilityLabel={t("planIt.question")}
          accessibilityHint={t("planIt.a11y.inputHint")}
        />
        <Pressable
          onPress={() => openPlanIt(text)}
          // Not `disabled`: long-press must still open the wizard while the field is empty.
          onLongPress={openWizard}
          hitSlop={theme.spacing.sm}
          style={[styles.sendBtn, !canSubmit && styles.sendBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={t("planIt.a11y.submit")}
          accessibilityHint={t("planIt.a11y.submitHint")}
          accessibilityState={{ disabled: !canSubmit }}
        >
          <Ionicons name="arrow-up" size={theme.spacing.xl} color={theme.colors.onPrimary} />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.chipsRow}
      >
        {/* Zero input: three plans from one tap. Solo only — hidden when planning with a person. */}
        {person ? null : (
          <Chip
            label={t("surprise.cta")}
            mode={mode}
            selected
            onPress={() => {
              inputRef.current?.blur();
              openSurprise();
            }}
          />
        )}
        {chips.map((key) => (
          <Chip key={key} label={chipLabel(key)} mode={mode} onPress={() => openPlanIt(chipPrompt(key))} />
        ))}
        <Pressable
          onPress={openWizard}
          style={styles.wizardLink}
          accessibilityRole="button"
          accessibilityLabel={t("planIt.stepByStep")}
        >
          <Ionicons name="list-outline" size={theme.spacing.md + theme.spacing.xxs} color={theme.colors.textSecondary} />
          <Text style={styles.wizardLinkText}>{t("planIt.stepByStep")}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
});

function makeStyles(theme: AppTheme, compact: boolean) {
  return StyleSheet.create({
    wrap: {
      gap: compact ? theme.spacing.xs : theme.spacing.sm,
    },
    titleRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
    title: {
      ...theme.type.bodyMedium,
      fontFamily: theme.type.bodyMedium.fontFamily,
      color: theme.colors.textPrimary,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.pill,
      paddingLeft: theme.spacing.lg,
      paddingRight: theme.spacing.xs,
      paddingVertical: theme.spacing.xs,
      ...theme.elevation(1),
    },
    inputRowFocused: { borderColor: theme.colors.primary },
    input: {
      flex: 1,
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textPrimary,
      paddingVertical: compact ? theme.spacing.xs : theme.spacing.sm,
    },
    sendBtn: {
      width: theme.spacing.huge,
      height: theme.spacing.huge,
      borderRadius: theme.radii.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.primary,
    },
    sendBtnDisabled: { opacity: 0.4 },
    chipsRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, paddingRight: theme.spacing.lg },
    wizardLink: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xxs,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
    },
    wizardLinkText: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
      textDecorationLine: "underline",
    },
  });
}
