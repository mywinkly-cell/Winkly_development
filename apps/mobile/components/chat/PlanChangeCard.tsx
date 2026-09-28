// apps/mobile/components/chat/PlanChangeCard.tsx
// The card plan-update posts in your shared chat when a plan is cancelled, moved, restored,
// someone can't make it, or sends a heads-up — with the reason they gave. Tapping it opens
// the plan in the Planner.

import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "@/constants/design-system";
import { Routes } from "@/constants/routes";
import { formatAppDate, formatAppTime, useAppLocaleTag } from "@/lib/i18n/appLocale";

export type PlanChangeCardPayload = {
  type: "plan_change";
  kind?: string;
  planner_item_id?: string;
  title?: string;
  actor_name?: string | null;
  reason?: string | null;
  new_starts_at?: string | null;
};

const ICONS: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  cancelled: "close-circle-outline",
  cant_make_it: "person-remove-outline",
  rescheduled: "time-outline",
  restored: "refresh-outline",
  heads_up: "chatbubble-ellipses-outline",
};

export function PlanChangeCard({ payload, mine }: { payload: PlanChangeCardPayload; mine: boolean }) {
  const theme = useAppTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const locale = useAppLocaleTag();
  const kind = payload.kind ?? "heads_up";
  const name = mine ? t("planChanges.you") : payload.actor_name || t("planChanges.someone");
  const title = payload.title || t("planChanges.yourPlan");
  const d = payload.new_starts_at ? new Date(payload.new_starts_at) : null;
  const when =
    d && !Number.isNaN(d.getTime())
      ? `${formatAppDate(d, { weekday: "short", day: "numeric", month: "short" }, locale)}, ${formatAppTime(d, undefined, locale)}`
      : "";

  const headline =
    kind === "cancelled"
      ? t("planChanges.cardCancelled", { name, title })
      : kind === "cant_make_it"
        ? t("planChanges.cardCantMakeIt", { name, title })
        : kind === "rescheduled"
          ? t("planChanges.cardRescheduled", { name, title, when })
          : kind === "restored"
            ? t("planChanges.cardRestored", { name, title })
            : t("planChanges.cardHeadsUp", { name, title });

  const accent = kind === "cancelled" || kind === "cant_make_it" ? theme.colors.error : theme.colors.primary;

  return (
    <Pressable
      onPress={() => {
        if (!payload.planner_item_id) return;
        router.push(`${Routes.planner}?focus_planner_item_id=${encodeURIComponent(payload.planner_item_id)}` as never);
      }}
      accessibilityRole="button"
      accessibilityLabel={headline}
      style={{
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.backgroundMuted,
        minWidth: 240,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <Ionicons name={ICONS[kind] ?? "calendar-outline"} size={20} color={accent} style={{ marginTop: 1 }} />
        <Text style={{ flex: 1, fontSize: 15, lineHeight: 21, fontWeight: "600", color: theme.colors.textPrimary }}>
          {headline}
        </Text>
      </View>
      {payload.reason ? (
        <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 20, fontStyle: "italic", color: theme.colors.textSecondary }}>
          “{payload.reason}”
        </Text>
      ) : null}
      <Text style={{ marginTop: 8, fontSize: 12, fontWeight: "600", color: theme.colors.primary }}>
        {t("planChanges.openInPlanner")}
      </Text>
    </Pressable>
  );
}
