/**
 * Step 6 — Invite / Share: "Invite someone?" when user hasn't selected participants yet.
 *
 * Invite sources are deliberately **cross-mode**: a Romance-tagged plan can still invite a
 * Friend / Business contact / Winkly contact (and vice versa). The plan's mode is a hint, not
 * a gate on who you can invite.
 */

import React, { useMemo } from "react";
import { View, Text, StyleSheet, Share } from "react-native";
import { GestureScrollView } from "@/components/ui/GestureScrollView";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { Card, ListRow, TextButton } from "@/components/ds";
import type { Mode } from "@/types";

export type InviteSourceChoice = "matches" | "friends" | "business" | "contacts" | "share_external" | "skip";

const OPTIONS: { key: InviteSourceChoice; label: string; icon: string; hint?: string }[] = [
  { key: "matches", label: "Romance matches", icon: "heart-outline", hint: "Dates & romance DMs" },
  { key: "friends", label: "Friends", icon: "people-outline", hint: "Friend connections" },
  { key: "business", label: "Business", icon: "briefcase-outline", hint: "Business connections" },
  { key: "contacts", label: "Winkly contacts", icon: "search-outline", hint: "Search anyone on Winkly" },
  { key: "share_external", label: "Share externally", icon: "share-outline", hint: "SMS, WhatsApp, etc." },
  { key: "skip", label: "Skip — just me for now", icon: "arrow-forward-outline" },
];

const MODE_LABEL: Partial<Record<Mode, string>> = {
  romance: "Date (Romance)",
  friends: "Meet-up (Friends)",
  business: "Meeting (Business)",
  events: "Solo / Events",
};

export type ConciergeInviteStepProps = {
  /** Plan's current mode — shown as context only; does not hide other invite sources. */
  mode: Mode;
  planTitle?: string;
  planLocation?: string;
  planDate?: string;
  planTime?: string;
  onSelect: (choice: InviteSourceChoice) => void;
  onBack: () => void;
  showInlineBack?: boolean;
};

export function ConciergeInviteStep({
  mode,
  planTitle,
  planLocation,
  planDate,
  planTime,
  onSelect,
  onBack,
  showInlineBack = true,
}: ConciergeInviteStepProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const modeLabel = MODE_LABEL[mode] ?? "this plan";

  const handleShareExternal = () => {
    Haptics.selectionAsync();
    const parts = [
      planTitle && `Plan: ${planTitle}`,
      planLocation && `Location: ${planLocation}`,
      planDate && `Date: ${planDate}`,
      planTime && `Time: ${planTime}`,
      "Join or view this plan in Winkly",
    ].filter(Boolean);
    Share.share({
      message: parts.join("\n"),
      title: planTitle ?? "Plan from Winkly",
    }).catch(() => {});
    onSelect("share_external");
  };

  return (
    <GestureScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {showInlineBack ? (
        <TextButton
          title="Back"
          icon={<Ionicons name="arrow-back" size={20} color={theme.colors.primary} />}
          onPress={onBack}
          style={styles.backRow}
        />
      ) : null}

      <Text style={styles.title}>Invite someone?</Text>
      <Text style={styles.subtitle}>
        This plan is tagged as {modeLabel}. You can still invite a romance match, a friend, a business
        contact, or anyone on Winkly — the invite mode follows who you pick (you can change it next).
      </Text>

      <Card style={styles.options} elevation={0} padding="none">
        {OPTIONS.map((opt, i) => {
          if (opt.key === "skip") {
            return (
              <ListRow
                key={opt.key}
                title={opt.label}
                trailing={<Ionicons name={opt.icon as keyof typeof Ionicons.glyphMap} size={20} color={theme.colors.textSecondary} />}
                onPress={() => { Haptics.selectionAsync(); onSelect("skip"); }}
                style={i > 0 ? { ...styles.row, ...styles.rowBorder } : styles.row}
              />
            );
          }
          return (
            <ListRow
              key={opt.key}
              title={opt.label}
              subtitle={opt.hint}
              leading={
                <View style={styles.optionIconWrap}>
                  <Ionicons name={opt.icon as keyof typeof Ionicons.glyphMap} size={22} color={theme.colors.primary} />
                </View>
              }
              onPress={opt.key === "share_external" ? handleShareExternal : () => { Haptics.selectionAsync(); onSelect(opt.key); }}
              style={i > 0 ? { ...styles.row, ...styles.rowBorder } : styles.row}
            />
          );
        })}
      </Card>
    </GestureScrollView>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    content: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xxl },
    backRow: { alignSelf: "flex-start", marginBottom: theme.spacing.lg, paddingLeft: 0 },
    title: { ...theme.type.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
    subtitle: { ...theme.type.caption, color: theme.colors.textSecondary, marginBottom: theme.spacing.xxl, lineHeight: 20 },
    options: {},
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
  });
}
