// apps/mobile/components/planner/PlanShareSection.tsx
// "Invite with a link" block in a planner item's details (organiser only): share the plan, see who
// said "I'm in" from the web page ("Anna is in — via link"), and turn the link off.
// Built on the D0 design system. See docs/PLAN_SHARING.md.

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { SecondaryButton, TextButton } from "@/components/ds";
import { useAppTheme } from "@/constants/design-system";
import { formatAppDate, formatAppTime } from "@/lib/i18n/appLocale";
import {
  getActivePlanShare,
  listWebRsvps,
  revokePlanShare,
  sharePlan,
  type PlanShare,
  type WebRsvp,
} from "@/lib/planShare";

type Props = {
  plannerItemId: string;
  title: string;
  startsAtIso?: string;
  /** False for past / archived plans: RSVPs stay visible, sharing is off. */
  canShare: boolean;
};

export function PlanShareSection({ plannerItemId, title, startsAtIso, canShare }: Props) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const [share, setShare] = useState<PlanShare | null>(null);
  const [rsvps, setRsvps] = useState<WebRsvp[]>([]);
  const [sharing, setSharing] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getActivePlanShare(plannerItemId), listWebRsvps(plannerItemId)]).then(([active, list]) => {
      if (cancelled) return;
      setShare(active);
      setRsvps(list);
    });
    return () => {
      cancelled = true;
    };
  }, [plannerItemId, reloadKey]);

  const onShare = useCallback(async () => {
    setSharing(true);
    try {
      await sharePlan({ plannerItemId, title, startsAt: startsAtIso, source: "planner_details", t });
    } catch {
      Alert.alert(t("common.error"), t("planShare.shareError"));
    } finally {
      setSharing(false);
      load();
    }
  }, [plannerItemId, title, startsAtIso, t, load]);

  const onRevoke = useCallback(() => {
    if (!share) return;
    Alert.alert(t("planShare.revokeConfirmTitle"), t("planShare.revokeConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("planShare.revokeConfirm"),
        style: "destructive",
        onPress: () => {
          setRevoking(true);
          revokePlanShare(share.id)
            .catch(() => Alert.alert(t("common.error"), t("planShare.revokeError")))
            .finally(() => {
              setRevoking(false);
              load();
            });
        },
      },
    ]);
  }, [share, t, load]);

  if (!canShare && rsvps.length === 0) return null;

  const expires = share ? new Date(share.expiresAt) : null;
  const expiresLabel = expires
    ? `${formatAppDate(expires, { weekday: "short", day: "numeric", month: "short" })} · ${formatAppTime(expires)}`
    : null;

  return (
    <View
      style={{
        marginTop: theme.spacing.lg,
        padding: theme.spacing.md,
        borderRadius: theme.radii.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        gap: theme.spacing.sm,
      }}
    >
      <Text style={[theme.type.h3, { color: theme.colors.textPrimary, fontFamily: theme.type.h3.fontFamily }]}>
        {t("planShare.sectionTitle")}
      </Text>
      {canShare ? (
        <Text style={[theme.type.caption, { color: theme.colors.textSecondary, fontFamily: theme.type.caption.fontFamily }]}>
          {t("planShare.sectionHint")}
        </Text>
      ) : null}

      {rsvps.length > 0 ? (
        <View style={{ gap: theme.spacing.xs }} accessibilityLabel={t("planShare.rsvpCount", { count: rsvps.length })}>
          {rsvps.map((r) => (
            <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
              <Ionicons
                name={r.status === "converted" ? "checkmark-circle" : "hand-right-outline"}
                size={18}
                color={r.status === "converted" ? theme.colors.success : theme.colors.primary}
              />
              <Text
                style={[theme.type.bodyMedium, { color: theme.colors.textPrimary, fontFamily: theme.type.bodyMedium.fontFamily, flex: 1 }]}
              >
                {r.status === "converted"
                  ? t("planShare.rsvpJoined", { name: r.firstName })
                  : t("planShare.rsvpViaLink", { name: r.firstName })}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {canShare ? (
        <SecondaryButton
          title={t("planShare.sharePlan")}
          onPress={() => void onShare()}
          loading={sharing}
          icon={<Ionicons name="share-social-outline" size={18} color={theme.colors.primary} />}
        />
      ) : null}

      {canShare && share && expiresLabel ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.sm }}>
          <Text
            style={[theme.type.caption, { color: theme.colors.textSecondary, fontFamily: theme.type.caption.fontFamily, flex: 1 }]}
          >
            {t("planShare.linkActiveUntil", { date: expiresLabel })}
          </Text>
          <TextButton
            title={t("planShare.revokeLink")}
            onPress={onRevoke}
            loading={revoking}
            textStyle={{ color: theme.colors.error }}
          />
        </View>
      ) : null}
    </View>
  );
}
