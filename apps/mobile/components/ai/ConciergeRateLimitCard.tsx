import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
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
};

function formatRetryHint(seconds?: number): string | null {
  if (seconds == null || seconds <= 0) return null;
  if (seconds >= 3600) {
    const hours = Math.ceil(seconds / 3600);
    return hours === 1 ? "Try again in about 1 hour." : `Try again in about ${hours} hours.`;
  }
  if (seconds >= 60) {
    const mins = Math.ceil(seconds / 60);
    return mins === 1 ? "Try again in about 1 minute." : `Try again in about ${mins} minutes.`;
  }
  return `Try again in ${seconds} seconds.`;
}

export function ConciergeRateLimitCard({
  errorCode,
  limitType,
  retryAfter,
  upgradeTo,
  onSaveForLater,
  onRetry,
  saving,
}: ConciergeRateLimitCardProps) {
  const theme = useAppTheme();
  const router = useRouter();

  const copy = useMemo(() => {
    if (errorCode === "daily_quota") {
      return {
        title: "Daily plan limit reached",
        body: "You've used your free AI plans for today. Upgrade for unlimited planning, or save this request and come back tomorrow.",
        showUpgrade: true,
      };
    }
    if (errorCode === "tier_required") {
      return {
        title: upgradeTo === "premium" ? "Premium concierge" : "Upgrade for AI planning",
        body:
          upgradeTo === "premium"
            ? "Full concierge — weather-aware plans, trip coordination, and more — is included with Premium."
            : "Super unlocks smarter planning ideas, event suggestions, and chat openers.",
        showUpgrade: true,
      };
    }
    return {
      title: "Slow down a moment",
      body: "You're sending requests quickly. Wait a bit, then try again — or save this request for later.",
      showUpgrade: false,
    };
  }, [errorCode, upgradeTo]);

  const retryHint = formatRetryHint(retryAfter);
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
          Dev preview — rate limit mock
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
            title={saving ? "Saving…" : "Save request for later"}
            onPress={() => onSaveForLater?.()}
            disabled={saving}
            icon={<Ionicons name="bookmark-outline" size={18} color={theme.colors.primary} />}
          />
        ) : null}
        {showRetry ? <PrimaryButton title="Try again" onPress={() => onRetry?.()} /> : null}
        {copy.showUpgrade ? (
          <PrimaryButton title="See plans" onPress={() => router.push("/account/subscription")} />
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
