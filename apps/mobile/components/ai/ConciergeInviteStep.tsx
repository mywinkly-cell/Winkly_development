/**
 * Step 6 — Invite / Share: "Invite someone?" when user hasn't selected participants yet.
 *
 * Invite sources are deliberately **cross-mode**: a Romance-tagged plan can still invite a
 * Friend / Business contact / Winkly contact (and vice versa). The plan's mode is a hint, not
 * a gate on who you can invite.
 */

import React, { useMemo } from "react";
import { View, Text, StyleSheet, Share } from "react-native";
import { useTranslation } from "react-i18next";
import { GestureScrollView } from "@/components/ui/GestureScrollView";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { Card, ListRow, TextButton } from "@/components/ds";
import type { Mode } from "@/types";

export type InviteSourceChoice = "matches" | "friends" | "business" | "contacts" | "share_external" | "skip";

// Labels: concierge.invite.option.<key> (+ .hint).
const OPTIONS: { key: InviteSourceChoice; icon: string; hasHint: boolean }[] = [
  { key: "matches", icon: "heart-outline", hasHint: true },
  { key: "friends", icon: "people-outline", hasHint: true },
  { key: "business", icon: "briefcase-outline", hasHint: true },
  { key: "contacts", icon: "search-outline", hasHint: true },
  { key: "share_external", icon: "share-outline", hasHint: true },
  { key: "skip", icon: "arrow-forward-outline", hasHint: false },
];

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
  const { t } = useTranslation();
  const theme = useAppTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const modeLabel = t(`concierge.invite.modeLabel.${mode}`);

  const handleShareExternal = () => {
    Haptics.selectionAsync();
    const parts = [
      planTitle && t("concierge.invite.share.plan", { value: planTitle }),
      planLocation && t("concierge.share.location", { address: planLocation }),
      planDate && t("concierge.invite.share.date", { value: planDate }),
      planTime && t("concierge.invite.share.time", { value: planTime }),
      t("concierge.invite.share.footer"),
    ].filter(Boolean);
    Share.share({
      message: parts.join("\n"),
      title: planTitle ?? t("concierge.invite.share.title"),
    }).catch(() => {});
    onSelect("share_external");
  };

  return (
    <GestureScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {showInlineBack ? (
        <TextButton
          title={t("common.back")}
          icon={<Ionicons name="arrow-back" size={20} color={theme.colors.primary} />}
          onPress={onBack}
          style={styles.backRow}
        />
      ) : null}

      <Text style={styles.title}>{t("concierge.invite.title")}</Text>
      <Text style={styles.subtitle}>{t("concierge.invite.subtitle", { mode: modeLabel })}</Text>

      <Card style={styles.options} elevation={0} padding="none">
        {OPTIONS.map((opt, i) => {
          if (opt.key === "skip") {
            return (
              <ListRow
                key={opt.key}
                title={t(`concierge.invite.option.${opt.key}`)}
                trailing={<Ionicons name={opt.icon as keyof typeof Ionicons.glyphMap} size={20} color={theme.colors.textSecondary} />}
                onPress={() => { Haptics.selectionAsync(); onSelect("skip"); }}
                style={i > 0 ? { ...styles.row, ...styles.rowBorder } : styles.row}
              />
            );
          }
          return (
            <ListRow
              key={opt.key}
              title={t(`concierge.invite.option.${opt.key}`)}
              subtitle={opt.hasHint ? t(`concierge.invite.option.${opt.key}.hint`) : undefined}
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
