// apps/mobile/components/planner/PlanChangeHistory.tsx
// "What changed" in plan details: cancelled / moved / can't make it / heads-ups, who did it,
// when, and the reason they gave. Hidden when nothing changed.

import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "@/constants/design-system";
import { formatAppDate, formatAppTime, useAppLocaleTag } from "@/lib/i18n/appLocale";
import { supabase } from "@/lib/supabase";
import { getPlanChanges, type PlanChange, type PlanChangeKind } from "@/lib/planner/planChanges";

const ICONS: Record<PlanChangeKind, React.ComponentProps<typeof Ionicons>["name"]> = {
  cancelled: "close-circle-outline",
  cant_make_it: "person-remove-outline",
  rescheduled: "time-outline",
  restored: "refresh-outline",
  heads_up: "chatbubble-ellipses-outline",
};

export function PlanChangeHistory({ plannerItemId }: { plannerItemId: string }) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const locale = useAppLocaleTag();
  const [changes, setChanges] = useState<PlanChange[]>([]);
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [{ data: auth }, rows] = await Promise.all([supabase.auth.getUser(), getPlanChanges(plannerItemId)]);
      if (cancelled) return;
      setMe(auth.user?.id ?? null);
      setChanges(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [plannerItemId]);

  if (!changes.length) return null;

  const when = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? ""
      : `${formatAppDate(d, { weekday: "short", day: "numeric", month: "short" }, locale)}, ${formatAppTime(d, undefined, locale)}`;
  };

  const line = (c: PlanChange) => {
    const name = c.actorId && c.actorId === me ? t("planChanges.you") : c.actorName ?? t("planChanges.someone");
    switch (c.kind) {
      case "cancelled":
        return t("planChanges.historyCancelled", { name });
      case "cant_make_it":
        return t("planChanges.historyCantMakeIt", { name });
      case "rescheduled":
        return t("planChanges.historyRescheduled", { name, when: when(c.newStartsAt) });
      case "restored":
        return t("planChanges.historyRestored", { name });
      default:
        return t("planChanges.historyHeadsUp", { name });
    }
  };

  return (
    <View style={{ marginTop: 16 }}>
      <Text style={[theme.type.bodyMedium, { color: theme.colors.textPrimary, marginBottom: 6 }]}>
        {t("planChanges.historyTitle")}
      </Text>
      {changes.map((c) => (
        <View key={c.id} style={styles.row}>
          <Ionicons name={ICONS[c.kind]} size={18} color={theme.colors.textSecondary} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={[theme.type.body, { color: theme.colors.textPrimary }]}>{line(c)}</Text>
            {c.reason ? (
              <Text style={[theme.type.caption, { color: theme.colors.textSecondary, fontStyle: "italic" }]}>
                “{c.reason}”
              </Text>
            ) : null}
            <Text style={[theme.type.caption, { color: theme.colors.textMuted }]}>{when(c.createdAt)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, paddingVertical: 6 },
});
