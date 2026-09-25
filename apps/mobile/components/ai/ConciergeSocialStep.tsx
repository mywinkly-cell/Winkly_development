/**
 * Step 3 — Social Context: "Who is joining you?"
 * Suggested people first, then options: Just me, Invite match/friends/…, Decide later.
 * Share is only available after the plan is confirmed (Add to planner step).
 */

import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { Card, ListRow, TextButton } from "@/components/ds";
import type { Mode } from "@/types";
import type { WhoJoining } from "@/lib/ai/conciergePlanningFlow";
import { isWhoJoiningAvailable } from "@/lib/modes/availability";
import { Avatar } from "@/components/ui/Avatar";

export type SuggestedPerson = {
  id: string;
  displayName: string;
  type: "match" | "friend" | "business";
  avatar_url?: string | null;
};

// Labels: concierge.social.option.<key>.
const OPTIONS: { key: WhoJoining; icon: string }[] = [
  { key: "just_me", icon: "person-outline" },
  { key: "invite_match", icon: "heart-outline" },
  { key: "invite_friends", icon: "people-outline" },
  { key: "invite_business", icon: "briefcase-outline" },
  { key: "invite_contacts", icon: "call-outline" },
  { key: "decide_later", icon: "time-outline" },
];

export type ConciergeSocialStepProps = {
  mode: Mode;
  /** Plan idea summary for share message (activity + location + date). */
  planSummary?: { activity?: string; location?: string; date?: string; time?: string };
  /** First 2 suggested people (e.g. recent match, friend nearby). */
  suggestedPeople?: SuggestedPerson[];
  onSelect: (who: WhoJoining, selectedPersonId?: string) => void;
  onBack: () => void;
  showInlineBack?: boolean;
};

export function ConciergeSocialStep({
  mode,
  planSummary,
  suggestedPeople = [],
  onSelect,
  onBack,
  showInlineBack = true,
}: ConciergeSocialStepProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {showInlineBack ? (
        <TextButton
          title={t("common.back")}
          icon={<Ionicons name="arrow-back" size={20} color={theme.colors.primary} />}
          onPress={onBack}
          style={styles.backRow}
        />
      ) : null}

      <Text style={styles.title}>{t("concierge.social.title")}</Text>
      <Text style={styles.subtitle}>{t("concierge.social.subtitle")}</Text>

      {suggestedPeople.length > 0 ? (
        <View style={styles.suggestedSection}>
          <Text style={styles.suggestedLabel}>{t("concierge.social.suggested")}</Text>
          <Card elevation={0} padding="none">
            {suggestedPeople.slice(0, 2).map((p, i) => (
              <ListRow
                key={p.id}
                title={p.displayName}
                subtitle={t(`concierge.social.personType.${p.type}`)}
                leading={<Avatar uri={p.avatar_url} size={40} />}
                onPress={() => {
                  Haptics.selectionAsync();
                  onSelect(
                    mode === "romance" ? "invite_match" : mode === "business" ? "invite_business" : "invite_friends",
                    p.id
                  );
                }}
                style={i > 0 ? { ...styles.row, ...styles.rowBorder } : styles.row}
              />
            ))}
          </Card>
        </View>
      ) : null}

      <Card elevation={0} padding="none">
        {OPTIONS.filter((opt) => isWhoJoiningAvailable(opt.key)).map((opt, i) => (
          <ListRow
            key={opt.key}
            title={t(`concierge.social.option.${opt.key}`)}
            leading={
              <View style={styles.optionIconWrap}>
                <Ionicons name={opt.icon as any} size={22} color={theme.colors.primary} />
              </View>
            }
            showChevron={false}
            onPress={() => {
              Haptics.selectionAsync();
              onSelect(opt.key, undefined);
            }}
            style={i > 0 ? { ...styles.row, ...styles.rowBorder } : styles.row}
          />
        ))}
      </Card>
    </ScrollView>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    content: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xxl },
    backRow: { alignSelf: "flex-start", marginBottom: theme.spacing.lg, paddingLeft: 0 },
    title: { ...theme.type.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
    subtitle: { ...theme.type.caption, color: theme.colors.textSecondary, marginBottom: theme.spacing.xxl },
    row: { paddingHorizontal: theme.spacing.lg },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
    optionIconWrap: {
      width: 40,
      height: 40,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    suggestedSection: { marginBottom: theme.spacing.xl, gap: theme.spacing.sm },
    suggestedLabel: {
      ...theme.type.caption,
      fontWeight: "600",
      color: theme.colors.textSecondary,
    },
  });
}
