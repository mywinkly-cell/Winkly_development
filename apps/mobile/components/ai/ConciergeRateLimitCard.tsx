import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Typography } from "@/constants/tokens";
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
    <View style={styles.card}>
      <View style={styles.iconRow}>
        <View style={styles.iconCircle}>
          <Ionicons name="hourglass-outline" size={22} color={Colors.primaryViolet} />
        </View>
        <SparklesIcon size={18} color={Colors.gray400} />
      </View>
      {isConciergeDevLimitMockEnabled() ? (
        <Text style={styles.devBadge}>Dev preview — rate limit mock</Text>
      ) : null}
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
      {retryHint ? <Text style={styles.retryHint}>{retryHint}</Text> : null}

      <View style={styles.actions}>
        {showSave ? (
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => {
              Haptics.selectionAsync();
              onSaveForLater?.();
            }}
            activeOpacity={0.9}
            disabled={saving}
          >
            <Ionicons name="bookmark-outline" size={18} color={Colors.primaryViolet} />
            <Text style={styles.secondaryBtnText}>{saving ? "Saving…" : "Save request for later"}</Text>
          </TouchableOpacity>
        ) : null}
        {showRetry ? (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              Haptics.selectionAsync();
              onRetry?.();
            }}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryBtnText}>Try again</Text>
          </TouchableOpacity>
        ) : null}
        {copy.showUpgrade ? (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/account/subscription");
            }}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryBtnText}>See plans</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 24,
    marginTop: 16,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.gray200,
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
    borderRadius: 20,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  devBadge: {
    ...Typography.caption,
    color: Colors.gray500,
    fontWeight: "600",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  title: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  body: {
    ...Typography.body,
    color: Colors.gray600,
    marginBottom: 8,
  },
  retryHint: {
    ...Typography.caption,
    color: Colors.primaryViolet,
    fontWeight: "600",
    marginBottom: 16,
  },
  actions: {
    gap: 10,
    marginTop: 8,
  },
  primaryBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: {
    ...Typography.button,
    color: Colors.white,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.gray100,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  secondaryBtnText: {
    ...Typography.body,
    color: Colors.primaryViolet,
    fontWeight: "600",
  },
});
