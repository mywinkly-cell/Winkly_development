/**
 * Chat experience suggestion card — shown in 1:1 Romance/Friends/Business chat for paid users.
 * Title, mini itinerary, duration; Plan date, Suggest another, Share.
 */

import React from "react";
import { Text, View, Share } from "react-native";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { TextButton } from "@/components/ds";
import { useAppTheme } from "@/constants/design-system";
import { PlanCard, PlanCardBadge, PlanCardIconAction } from "@/components/plans/PlanCard";
import type { ChatExperienceSuggestion } from "@/lib/ai/chatExperienceSuggestion";

export type ChatExperienceSuggestionCardProps = {
  suggestion: ChatExperienceSuggestion;
  /** Mode for copy and accent (romance / friends / business) */
  mode: "romance" | "friends" | "business";
  onPlanDate: () => void;
  onSuggestAnother: () => void;
};

export function ChatExperienceSuggestionCard({
  suggestion,
  mode,
  onPlanDate,
  onSuggestAnother,
}: ChatExperienceSuggestionCardProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const accent = theme.modeAccent(mode).primary;

  const handleShare = async () => {
    Haptics.selectionAsync();
    const text = [
      suggestion.title,
      ...suggestion.itinerary.map((i) => `${i.time ?? ""} ${i.time ? " " : ""}${i.activity}`.trim()),
      t("chat.suggestion.estShort", { duration: suggestion.estimatedDuration }),
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await Share.share({ message: text, title: suggestion.title });
    } catch {
      // user dismissed
    }
  };

  return (
    <PlanCard
      style={{ marginHorizontal: theme.spacing.md, marginBottom: theme.spacing.md }}
      accentColor={accent}
      title={suggestion.title}
      badges={<PlanCardBadge label={t("chat.suggestion.badge")} icon="sparkles-outline" tone="primary" color={accent} />}
      primaryAction={{
        label:
          mode === "romance"
            ? t("chat.suggestion.planDate")
            : mode === "business"
              ? t("chat.suggestion.scheduleMeeting")
              : t("chat.suggestion.addToPlanner"),
        onPress: onPlanDate,
        tone: accent,
      }}
      secondaryActions={
        <PlanCardIconAction icon="share-outline" accessibilityLabel={t("events.share")} tone="muted" onPress={handleShare} />
      }
    >
      {suggestion.subtitle ? (
        <Text
          numberOfLines={2}
          style={[
            theme.type.caption,
            { color: theme.colors.textSecondary, fontFamily: theme.type.caption.fontFamily, marginBottom: theme.spacing.sm },
          ]}
        >
          {suggestion.subtitle}
        </Text>
      ) : null}

      <View style={{ gap: theme.spacing.xs, marginBottom: theme.spacing.sm }}>
        {suggestion.itinerary.map((step, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
            {step.time ? (
              <Text
                style={[
                  theme.type.caption,
                  { color: theme.colors.textMuted, fontFamily: theme.type.caption.fontFamily, minWidth: 40 },
                ]}
              >
                {step.time}
              </Text>
            ) : null}
            <Text
              style={[
                theme.type.body,
                { color: theme.colors.textPrimary, fontFamily: theme.type.body.fontFamily, flex: 1 },
              ]}
            >
              {step.activity}
            </Text>
          </View>
        ))}
      </View>

      <Text
        style={[
          theme.type.caption,
          { color: theme.colors.textMuted, fontFamily: theme.type.caption.fontFamily, marginBottom: theme.spacing.sm },
        ]}
      >
        {t("chat.suggestion.estimatedDuration", { duration: suggestion.estimatedDuration })}
      </Text>

      <TextButton
        title={t("chat.suggestion.another")}
        onPress={() => {
          Haptics.selectionAsync();
          onSuggestAnother();
        }}
        textStyle={{ color: accent }}
        style={{ paddingHorizontal: 0, alignSelf: "flex-start" }}
      />
    </PlanCard>
  );
}
