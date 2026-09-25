import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/constants/design-system";
import { Card, PrimaryButton, SecondaryButton } from "@/components/ds";
import type { ConciergeErrorCode, ConciergeLimitType } from "@/lib/ai/conciergeClient";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { isConciergeDevLimitMockEnabled } from "@/lib/ai/conciergeDevLimitMock";

export type ConciergeRateLimitCardProps = {
  errorCode: ConciergeErrorCode;
  limitType?: ConciergeLimitType;
  retryAfter?: number;
  upgradeTo?: "super" | "premium";
  onSaveForLater?: () => void;
  onRetry?: () => void;
  saving?: boolean;
  /** "surprise" = Surprise me: friendlier, localized copy (no request to save). */
  variant?: "default" | "surprise";
};

function formatRetryHint(t: (key: string, opts?: Record<string, unknown>) => string, seconds?: number): string | null {
  if (seconds == null || seconds <= 0) return null;
  if (seconds >= 3600) return t("concierge.limit.retryHours", { count: Math.ceil(seconds / 3600) });
  if (seconds >= 60) return t("concierge.limit.retryMinutes", { count: Math.ceil(seconds / 60) });
  return t("concierge.limit.retrySeconds", { count: seconds });
}

export function ConciergeRateLimitCard({
  errorCode,
  limitType,
  retryAfter,
  upgradeTo,
  onSaveForLater,
  onRetry,
  saving,
  variant = "default",
}: ConciergeRateLimitCardProps) {
  const theme = useAppTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const isSurprise = variant === "surprise";

  const copy = useMemo(() => {
    if (isSurprise && (errorCode === "daily_quota" || errorCode === "tier_required")) {
      return { title: t("surprise.limit.dailyTitle"), body: t("surprise.limit.dailyBody"), showUpgrade: true };
    }
    if (isSurprise) {
      return { title: t("surprise.limit.burstTitle"), body: t("surprise.limit.burstBody"), showUpgrade: false };
    }
    if (errorCode === "daily_quota") {
      return { title: t("concierge.limit.dailyTitle"), body: t("concierge.limit.dailyBody"), showUpgrade: true };
    }
    if (errorCode === "tier_required") {
      return {
        title: upgradeTo === "premium" ? t("concierge.limit.premiumTitle") : t("concierge.limit.upgradeTitle"),
        body: upgradeTo === "premium" ? t("concierge.limit.premiumBody") : t("concierge.limit.upgradeBody"),
        showUpgrade: true,
      };
    }
    return { title: t("concierge.limit.burstTitle"), body: t("concierge.limit.burstBody"), showUpgrade: false };
  }, [errorCode, upgradeTo, isSurprise, t]);

  // The surprise copy already says when to come back.
  const retryHint = isSurprise ? null : formatRetryHint(t, retryAfter);
  const showSave = !!onSaveForLater && (errorCode === "rate_limit" || errorCode === "daily_quota");
  const showRetry =
    !!onRetry &&
    errorCode === "rate_limit" &&
    limitType !== "provider_quota";

  return (
    <Card style={styles.card}>
      <View style={styles.iconRow}>
        <View style={[styles.iconCircle, { backgroundColor: theme.colors.backgroundMuted, borderRadius: theme.radii.pill }]}>
          <Ionicons name="hourglass-outline" size={22} color={theme.colors.primary} />
        </View>
        <SparklesIcon size={18} color={theme.colors.textMuted} />
      </View>
      {isConciergeDevLimitMockEnabled() ? (
        <Text style={[theme.type.overline, { color: theme.colors.textMuted, marginBottom: theme.spacing.sm }]}>
          {t("concierge.limit.devPreview")}
        </Text>
      ) : null}
      <Text style={[theme.type.h3, { color: theme.colors.textPrimary, marginBottom: theme.spacing.sm }]}>{copy.title}</Text>
      <Text style={[theme.type.body, { color: theme.colors.textSecondary, marginBottom: theme.spacing.sm }]}>{copy.body}</Text>
      {retryHint ? (
        <Text style={[theme.type.caption, { color: theme.colors.primary, fontWeight: "600", marginBottom: theme.spacing.lg }]}>
          {retryHint}
        </Text>
      ) : null}

      <View style={[styles.actions, { gap: theme.spacing.sm, marginTop: theme.spacing.sm }]}>
        {showSave ? (
          <SecondaryButton
            title={saving ? t("planner.saving") : t("concierge.limit.saveForLater")}
            onPress={() => onSaveForLater?.()}
            disabled={saving}
            icon={<Ionicons name="bookmark-outline" size={18} color={theme.colors.primary} />}
          />
        ) : null}
        {showRetry ? (
          <PrimaryButton title={isSurprise ? t("surprise.retry") : t("concierge.limit.tryAgain")} onPress={() => onRetry?.()} />
        ) : null}
        {copy.showUpgrade ? (
          <PrimaryButton
            title={isSurprise ? t("surprise.limit.seePlans") : t("concierge.limit.seePlans")}
            onPress={() => router.push("/account/subscription")}
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 24,
    marginTop: 16,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {},
});
