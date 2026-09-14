/**
 * Step 6 — Invite / Share: "Invite someone?" when user hasn't selected participants yet.
 *
 * Invite sources are deliberately **cross-mode**: a Romance-tagged plan can still invite a
 * Friend / Business contact / Winkly contact (and vice versa). The plan's mode is a hint, not
 * a gate on who you can invite.
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Share } from "react-native";
import { GestureScrollView } from "@/components/ui/GestureScrollView";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Card, ListRow } from "@/components/ds";
import { useAppTheme } from "@/constants/design-system";
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
    <GestureScrollView style={styles.scroll} contentContainerStyle={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xxl }}>
      {showInlineBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backRow} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.primary} />
          <Text style={[theme.type.caption, { color: theme.colors.primary, fontFamily: theme.type.caption.fontFamily, fontWeight: "600" }]}>
            Back
          </Text>
        </TouchableOpacity>
      ) : null}

      <Text style={[theme.type.h3, { color: theme.colors.textPrimary, fontFamily: theme.type.h3.fontFamily, marginBottom: theme.spacing.sm }]}>
        Invite someone?
      </Text>
      <Text
        style={[
          theme.type.caption,
          { color: theme.colors.textSecondary, fontFamily: theme.type.caption.fontFamily, marginBottom: theme.spacing.xxl, lineHeight: 20 },
        ]}
      >
        This plan is tagged as {modeLabel}. You can still invite a romance match, a friend, a business
        contact, or anyone on Winkly — the invite mode follows who you pick (you can change it next).
      </Text>

      <View style={{ gap: theme.spacing.md }}>
        {OPTIONS.map((opt) => {
          const leading = (
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: theme.radii.pill,
                backgroundColor: theme.colors.backgroundMuted,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={opt.icon as keyof typeof Ionicons.glyphMap} size={24} color={theme.colors.primary} />
            </View>
          );

          if (opt.key === "skip") {
            return (
              <Card key={opt.key} elevation={0} padding="none" style={{ backgroundColor: theme.colors.backgroundMuted }}>
                <ListRow
                  title={opt.label}
                  onPress={() => { Haptics.selectionAsync(); onSelect("skip"); }}
                  trailing={<Ionicons name={opt.icon as keyof typeof Ionicons.glyphMap} size={20} color={theme.colors.textSecondary} />}
                  style={{ paddingHorizontal: theme.spacing.lg }}
                />
              </Card>
            );
          }

          const onPress = opt.key === "share_external" ? handleShareExternal : () => { Haptics.selectionAsync(); onSelect(opt.key); };

          return (
            <Card key={opt.key} elevation={0} padding="none">
              <ListRow
                title={opt.label}
                subtitle={opt.hint}
                leading={leading}
                onPress={onPress}
                showChevron
                style={{ paddingHorizontal: theme.spacing.lg }}
              />
            </Card>
          );
        })}
      </View>
    </GestureScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
});
