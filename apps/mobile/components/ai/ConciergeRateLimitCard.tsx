import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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

function formatRetryHint(t: TFunction, seconds?: number): string | null {
  if (seconds == null || seconds <= 0) return null;
  if (seconds >= 3600) return t("paywall.limit.retryHours", { count: Math.ceil(seconds / 3600) });
  if (seconds >= 60) return t("paywall.limit.retryMinutes", { count: Math.ceil(seconds / 60) });
  return t("paywall.limit.retrySeconds", { count: seconds });
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
      return { title: t("paywall.limit.dailyTitle"), body: t("paywall.limit.dailyBody"), showUpgrade: true };
    }
    if (errorCode === "tier_required") {
      return {
        title: upgradeTo === "premium" ? t("paywall.limit.premiumTitle") : t("paywall.limit.superTitle"),
        body: upgradeTo === "premium" ? t("paywall.limit.premiumBody") : t("paywall.limit.superBody"),
        showUpgrade: true,
      };
    }
    return {
      title: t("paywall.limit.burstTitle"),
      body: t("paywall.limit.burstBody"),
      showUpgrade: false,
    };
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
          {/* eslint-disable-next-line winkly/no-literal-string -- dev-only mock banner */}
          {"Dev preview — rate limit mock"}
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
            title={saving ? t("paywall.limit.saving") : t("paywall.limit.saveForLater")}
            onPress={() => onSaveForLater?.()}
            disabled={saving}
            icon={<Ionicons name="bookmark-outline" size={18} color={theme.colors.primary} />}
          />
        ) : null}
        {showRetry ? (
          <PrimaryButton title={isSurprise ? t("surprise.retry") : t("errorState.retry")} onPress={() => onRetry?.()} />
        ) : null}
        {copy.showUpgrade ? (
          <PrimaryButton
            title={isSurprise ? t("surprise.limit.seePlans") : t("paywall.limit.seePlans")}
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
