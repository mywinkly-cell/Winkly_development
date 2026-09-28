// apps/mobile/components/planner/PlanAlertsBanner.tsx
// Live alerts for upcoming plans (plan-watch-cron → plan_alerts): storms / heavy rain / snow
// at the plan's place and time, or traffic that would make the user late. Each alert offers
// what you'd actually do next:
//   • Change the time (organiser moves it; others suggest a new time),
//   • Tell the others (a heads-up with a ready-made message you can edit),
//   • Dismiss.

import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Modal, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { Card, Input, PrimaryButton, SecondaryButton, TextButton } from "@/components/ds";
import { useAppTheme } from "@/constants/design-system";
import { formatAppTime, useAppLocaleTag } from "@/lib/i18n/appLocale";
import { supabase } from "@/lib/supabase";
import { dismissPlanAlert, getOpenPlanAlerts, updatePlan, type PlanAlert } from "@/lib/planner/planChanges";
import type { ReschedulePlan } from "@/components/planner/ReschedulePlanSheet";

const WEATHER_ICONS: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  storm: "thunderstorm-outline",
  heavy_rain: "rainy-outline",
  rain: "rainy-outline",
  snow: "snow-outline",
  heat: "sunny-outline",
  cold: "thermometer-outline",
};

const WEATHER_CONDITIONS = ["storm", "heavy_rain", "rain", "snow", "heat", "cold"] as const;
type WeatherCondition = (typeof WEATHER_CONDITIONS)[number];
const asWeather = (c: string): WeatherCondition =>
  (WEATHER_CONDITIONS as readonly string[]).includes(c) ? (c as WeatherCondition) : "rain";

const WEATHER_TITLE_KEYS: Record<WeatherCondition, string> = {
  storm: "planChanges.alertWeather_storm",
  heavy_rain: "planChanges.alertWeather_heavy_rain",
  rain: "planChanges.alertWeather_rain",
  snow: "planChanges.alertWeather_snow",
  heat: "planChanges.alertWeather_heat",
  cold: "planChanges.alertWeather_cold",
};

const WEATHER_MESSAGE_KEYS: Record<WeatherCondition, string> = {
  storm: "planChanges.tellWeatherMessage_storm",
  heavy_rain: "planChanges.tellWeatherMessage_heavy_rain",
  rain: "planChanges.tellWeatherMessage_rain",
  snow: "planChanges.tellWeatherMessage_snow",
  heat: "planChanges.tellWeatherMessage_heat",
  cold: "planChanges.tellWeatherMessage_cold",
};

export function PlanAlertsBanner({
  plans,
  refreshKey,
  onChangeTime,
}: {
  /** The user's active upcoming plans, by id. Alerts for plans not listed are hidden. */
  plans: Map<string, ReschedulePlan>;
  /** Bump to reload (e.g. after a push arrived). */
  refreshKey?: number;
  onChangeTime: (plan: ReschedulePlan, reason: string) => void;
}) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const locale = useAppLocaleTag();
  const [alerts, setAlerts] = useState<PlanAlert[]>([]);
  /** When the alerts were loaded — plans that have started since are hidden. */
  const [loadedAt, setLoadedAt] = useState(0);
  const [tellFor, setTellFor] = useState<{ alert: PlanAlert; plan: ReschedulePlan } | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user?.id) return;
        const rows = await getOpenPlanAlerts(auth.user.id);
        if (cancelled) return;
        setAlerts(rows);
        setLoadedAt(Date.now());
      })();
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey])
  );

  const shown = alerts.filter((a) => {
    const p = plans.get(a.plannerItemId);
    return !!p && Date.parse(p.startsAt) > loadedAt;
  });
  if (!shown.length && !tellFor) return null;

  const timeOf = (iso: unknown) => {
    const d = typeof iso === "string" ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime()) ? formatAppTime(d, undefined, locale) : "";
  };

  const texts = (a: PlanAlert, p: ReschedulePlan) => {
    if (a.kind === "traffic") {
      const minutes = Number(a.data.extra_minutes ?? 0);
      return {
        icon: "car-outline" as const,
        title: t("planChanges.alertTrafficTitle", { minutes }),
        body: t("planChanges.alertTrafficBody", { time: timeOf(a.data.leave_by), title: p.title }),
        reason: t("planChanges.reasonTraffic"),
        message: t("planChanges.tellTrafficMessage", { minutes }),
      };
    }
    const c = asWeather(a.condition);
    return {
      icon: WEATHER_ICONS[c] ?? ("cloud-outline" as const),
      title: t(WEATHER_TITLE_KEYS[c]),
      body: t("planChanges.alertWeatherBody", { title: p.title, time: timeOf(a.data.at ?? p.startsAt) }),
      reason: t("planChanges.reasonWeather"),
      message: t(WEATHER_MESSAGE_KEYS[c]),
    };
  };

  const dismiss = (a: PlanAlert) => {
    Haptics.selectionAsync();
    setAlerts((prev) => prev.filter((x) => x.id !== a.id));
    void dismissPlanAlert(a.id);
  };

  const send = async () => {
    if (!tellFor || !message.trim()) return;
    setSending(true);
    const res = await updatePlan({ plannerItemId: tellFor.plan.id, action: "notify", reason: message.trim() });
    setSending(false);
    if (!res.ok) {
      Alert.alert(t("planChanges.failedTitle"), t("planChanges.failedBody"));
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const a = tellFor.alert;
    setTellFor(null);
    setAlerts((prev) => prev.filter((x) => x.id !== a.id));
    void dismissPlanAlert(a.id);
    Alert.alert(t("planChanges.toldTitle"), t("planChanges.toldBody"));
  };

  return (
    <>
      {shown.map((a) => {
        const p = plans.get(a.plannerItemId)!;
        const x = texts(a, p);
        return (
          <Card key={a.id} padding="md" style={{ marginBottom: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.warningBorder }}>
            <View style={styles.head}>
              <Ionicons name={x.icon} size={22} color={theme.colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={[theme.type.bodyMedium, { color: theme.colors.textPrimary }]}>{x.title}</Text>
                <Text style={[theme.type.caption, { color: theme.colors.textSecondary }]}>{x.body}</Text>
              </View>
              <TextButton title={t("planChanges.dismiss")} onPress={() => dismiss(a)} />
            </View>
            <View style={styles.actions}>
              <SecondaryButton
                title={p.isOrganiser ? t("planChanges.changeTime") : t("planChanges.suggestTime")}
                onPress={() => onChangeTime(p, x.reason)}
                style={{ flex: 1 }}
              />
              {p.hasOthers ? (
                <PrimaryButton
                  title={t("planChanges.tellOthers")}
                  onPress={() => {
                    setMessage(x.message);
                    setTellFor({ alert: a, plan: p });
                  }}
                  style={{ flex: 1 }}
                />
              ) : null}
            </View>
          </Card>
        );
      })}

      <Modal visible={!!tellFor} animationType="slide" transparent onRequestClose={() => setTellFor(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radii.lg, borderTopRightRadius: theme.radii.lg }]}>
            <View style={styles.head}>
              <Text style={[theme.type.h3, { color: theme.colors.textPrimary, flex: 1 }]}>{t("planChanges.tellOthersTitle")}</Text>
              <TextButton title={t("common.cancel")} onPress={() => setTellFor(null)} />
            </View>
            <Text style={[theme.type.caption, { color: theme.colors.textSecondary, marginBottom: theme.spacing.sm }]} numberOfLines={2}>
              {tellFor?.plan.title}
            </Text>
            <Input value={message} onChangeText={setMessage} multiline maxLength={300} placeholder={t("planChanges.reasonPlaceholder")} />
            <PrimaryButton
              title={t("planChanges.send")}
              onPress={send}
              loading={sending}
              disabled={sending || !message.trim()}
              style={{ marginTop: theme.spacing.md }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { padding: 20, paddingBottom: 32 },
});
