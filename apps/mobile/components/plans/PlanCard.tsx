// apps/mobile/components/plans/PlanCard.tsx
// Shared plan/spark card shell built on the D0 design system (components/ds + constants/design-system).
// Every place a plan appears — the Sparks list, the Concierge planning flow's
// option and confirm steps, and the Planner tab's confirmed entries — renders
// through this shell so they share one Card surface, one type scale for
// title/metadata, and one primary-action style. Callers still own their own
// content (itinerary rows, edit fields, itinerary variants); PlanCard only
// standardizes the surface, the title, the metadata rows, and the action row.

import React from "react";
import { Pressable, Text, View, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { Card, PrimaryButton } from "@/components/ds";
import { useAppTheme } from "@/constants/design-system";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

export type PlanCardAction = {
  label: string;
  onPress: () => void;
  icon?: IoniconName;
  disabled?: boolean;
  loading?: boolean;
  /** Overrides the button color (e.g. a mode/slot accent, or success green once planned). Defaults to theme primary. */
  tone?: string;
};

type PlanCardProps = {
  /** Tap target covering the title + metadata region — opens plan details. Omit for a non-tappable card. */
  onPress?: () => void;
  /** Left accent stripe. Defaults to the theme primary. */
  accentColor?: string;
  /** Top row of status/category chips — compose with `PlanCardBadge`. */
  badges?: React.ReactNode;
  title: string;
  /** Date/time + location rows — compose with `PlanCardMeta`. */
  meta?: React.ReactNode;
  /** Extra content between meta and the primary action (itinerary steps, weather notes, edit fields, ...). */
  children?: React.ReactNode;
  /** "Open in Maps" affordance, rendered just above the action row — use `PlanCardMapLink`. */
  mapAction?: React.ReactNode;
  /** Omit for cards with no single CTA (e.g. an already-confirmed planner entry) — pass management icons via `secondaryActions` instead. */
  primaryAction?: PlanCardAction;
  /** Small icon-only actions rendered beside the primary button — compose with `PlanCardIconAction`. */
  secondaryActions?: React.ReactNode;
  /** Dims the card once a plan is already confirmed or in the past. */
  dimmed?: boolean;
  style?: ViewStyle;
};

export function PlanCard({
  onPress,
  accentColor,
  badges,
  title,
  meta,
  children,
  mapAction,
  primaryAction,
  secondaryActions,
  dimmed,
  style,
}: PlanCardProps) {
  const theme = useAppTheme();
  const accent = accentColor ?? theme.colors.primary;

  const header = (
    <>
      {badges ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            gap: theme.spacing.sm,
            marginBottom: theme.spacing.sm,
          }}
        >
          {badges}
        </View>
      ) : null}
      <Text
        style={[theme.type.h2, { color: theme.colors.textPrimary, fontFamily: theme.type.h2.fontFamily }]}
        numberOfLines={2}
      >
        {title}
      </Text>
      {meta ? (
        <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.sm }}>{meta}</View>
      ) : null}
    </>
  );

  return (
    <Card
      elevation={1}
      padding="lg"
      style={[{ borderLeftWidth: 4, borderLeftColor: accent, opacity: dimmed ? 0.7 : 1 }, style]}
    >
      {onPress ? (
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            onPress();
          }}
          accessibilityRole="button"
          accessibilityLabel={title}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
        >
          {header}
        </Pressable>
      ) : (
        header
      )}

      {children ? <View style={{ marginTop: theme.spacing.md }}>{children}</View> : null}
      {mapAction ? <View style={{ marginTop: theme.spacing.md }}>{mapAction}</View> : null}

      {primaryAction || secondaryActions ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
          {primaryAction ? (
            <View style={{ flex: 1 }}>
              <PrimaryButton
                title={primaryAction.label}
                onPress={primaryAction.onPress}
                disabled={primaryAction.disabled}
                loading={primaryAction.loading}
                icon={
                  primaryAction.icon ? (
                    <Ionicons name={primaryAction.icon} size={18} color={theme.colors.onPrimary} />
                  ) : undefined
                }
                style={primaryAction.tone ? { backgroundColor: primaryAction.tone } : undefined}
              />
            </View>
          ) : null}
          {secondaryActions}
        </View>
      ) : null}
    </Card>
  );
}

type PlanCardBadgeProps = {
  label: string;
  icon?: IoniconName;
  /** "filled" tints the tone color as a soft background; "solid" fills with the tone color; "outlined" rings it. Default "filled". */
  variant?: "filled" | "outlined" | "solid";
  tone?: "neutral" | "success" | "primary";
  /** Overrides `tone` with a specific accent (e.g. a per-mode or per-slot color). */
  color?: string;
};

export function PlanCardBadge({ label, icon, variant = "filled", tone = "neutral", color }: PlanCardBadgeProps) {
  const theme = useAppTheme();
  const base = color ?? (tone === "success" ? theme.colors.success : tone === "primary" ? theme.colors.primary : theme.colors.textSecondary);

  let backgroundColor: string;
  let textColor: string;
  let borderColor: string | undefined;

  if (variant === "solid") {
    backgroundColor = base;
    textColor = theme.colors.onPrimary;
  } else if (variant === "outlined") {
    backgroundColor = theme.colors.surface;
    textColor = base;
    borderColor = base;
  } else {
    backgroundColor = tone === "success" ? theme.colors.successBg : tone === "neutral" ? theme.colors.backgroundMuted : base + "1F";
    textColor = base;
  }

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingVertical: 3,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radii.sm,
        backgroundColor,
        borderWidth: borderColor ? 1 : 0,
        borderColor,
        maxWidth: 160,
      }}
    >
      {icon ? <Ionicons name={icon} size={11} color={textColor} /> : null}
      <Text
        numberOfLines={1}
        style={[theme.type.overline, { color: textColor, fontFamily: theme.type.overline.fontFamily }]}
      >
        {label}
      </Text>
    </View>
  );
}

export function PlanCardMeta({
  icon,
  children,
  numberOfLines,
}: {
  icon: IoniconName;
  children: React.ReactNode;
  numberOfLines?: number;
}) {
  const theme = useAppTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.xs }}>
      <Ionicons name={icon} size={15} color={theme.colors.textSecondary} style={{ marginTop: 2 }} />
      <Text
        numberOfLines={numberOfLines}
        style={[theme.type.body, { color: theme.colors.textSecondary, fontFamily: theme.type.body.fontFamily, flex: 1 }]}
      >
        {children}
      </Text>
    </View>
  );
}

export function PlanCardMapLink({ label: labelProp, onPress }: { label?: string; onPress: () => void }) {
  const { t } = useTranslation();
  const label = labelProp ?? t("planner.openInMaps");
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, alignSelf: "flex-start" }}
    >
      <Ionicons name="map-outline" size={16} color={theme.colors.primary} />
      <Text style={[theme.type.bodyMedium, { color: theme.colors.primary, fontFamily: theme.type.bodyMedium.fontFamily }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function PlanCardIconAction({
  icon,
  onPress,
  accessibilityLabel,
  tone = "primary",
}: {
  icon: IoniconName;
  onPress: () => void;
  accessibilityLabel: string;
  tone?: "primary" | "muted" | "error";
}) {
  const theme = useAppTheme();
  const color = tone === "error" ? theme.colors.error : tone === "muted" ? theme.colors.textSecondary : theme.colors.primary;
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: theme.radii.pill,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? theme.colors.backgroundMuted : theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
      })}
    >
      <Ionicons name={icon} size={19} color={color} />
    </Pressable>
  );
}
