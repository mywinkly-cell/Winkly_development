/**
 * Step 3 — Social Context: "Who is joining you?"
 * Suggested people first, then options: Just me, Invite match/friends/…, Decide later.
 * Share is only available after the plan is confirmed (Add to planner step).
 */

import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { Card, ListRow, TextButton } from "@/components/ds";
import type { Mode } from "@/types";
import type { WhoJoining } from "@/lib/ai/conciergePlanningFlow";
import { Avatar } from "@/components/ui/Avatar";

export type SuggestedPerson = {
  id: string;
  displayName: string;
  type: "match" | "friend" | "business";
  avatar_url?: string | null;
};

const OPTIONS: { key: WhoJoining; label: string; icon: string }[] = [
  { key: "just_me", label: "Just me", icon: "person-outline" },
  { key: "invite_match", label: "Invite a match", icon: "heart-outline" },
  { key: "invite_friends", label: "Invite friends", icon: "people-outline" },
  { key: "invite_business", label: "Invite business contact", icon: "briefcase-outline" },
  { key: "invite_contacts", label: "Invite from contacts", icon: "call-outline" },
  { key: "decide_later", label: "Decide later", icon: "time-outline" },
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
          title="Back"
          icon={<Ionicons name="arrow-back" size={20} color={theme.colors.primary} />}
          onPress={onBack}
          style={styles.backRow}
        />
      ) : null}

      <Text style={styles.title}>Who is joining you?</Text>
      <Text style={styles.subtitle}>
        Add people to your plan or skip to generate
      </Text>

      {suggestedPeople.length > 0 ? (
        <View style={styles.suggestedSection}>
          <Text style={styles.suggestedLabel}>Suggested</Text>
          <Card elevation={0} padding="none">
            {suggestedPeople.slice(0, 2).map((p, i) => (
              <ListRow
                key={p.id}
                title={p.displayName}
                subtitle={p.type === "match" ? "Recent match" : p.type === "business" ? "Business contact" : "Friend nearby"}
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
        {OPTIONS.map((opt, i) => (
          <ListRow
            key={opt.key}
            title={opt.label}
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
