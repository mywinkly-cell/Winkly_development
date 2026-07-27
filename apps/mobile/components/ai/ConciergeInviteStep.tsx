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
import { Colors, Typography, Layout } from "@/constants/tokens";
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
        <TouchableOpacity onPress={onBack} style={styles.backRow} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color={Colors.primaryViolet} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.title}>Invite someone?</Text>
      <Text style={styles.subtitle}>
        This plan is tagged as {modeLabel}. You can still invite a romance match, a friend, a business
        contact, or anyone on Winkly — the invite mode follows who you pick (you can change it next).
      </Text>

      <View style={styles.options}>
        {OPTIONS.map((opt) => {
          if (opt.key === "share_external") {
            return (
              <TouchableOpacity
                key={opt.key}
                style={styles.optionCard}
                onPress={handleShareExternal}
                activeOpacity={0.85}
              >
                <View style={styles.optionIconWrap}>
                  <Ionicons name={opt.icon as keyof typeof Ionicons.glyphMap} size={24} color={Colors.primaryViolet} />
                </View>
                <View style={styles.optionTextCol}>
                  <Text style={styles.optionLabel}>{opt.label}</Text>
                  {opt.hint ? <Text style={styles.optionHint}>{opt.hint}</Text> : null}
                </View>
              </TouchableOpacity>
            );
          }
          if (opt.key === "skip") {
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.optionCard, styles.optionCardSecondary]}
                onPress={() => { Haptics.selectionAsync(); onSelect("skip"); }}
                activeOpacity={0.85}
              >
                <Text style={styles.optionLabelSecondary}>{opt.label}</Text>
                <Ionicons name={opt.icon as keyof typeof Ionicons.glyphMap} size={20} color={Colors.gray600} />
              </TouchableOpacity>
            );
          }
          return (
            <TouchableOpacity
              key={opt.key}
              style={styles.optionCard}
              onPress={() => {
                Haptics.selectionAsync();
                onSelect(opt.key);
              }}
              activeOpacity={0.85}
            >
              <View style={styles.optionIconWrap}>
                <Ionicons name={opt.icon as keyof typeof Ionicons.glyphMap} size={24} color={Colors.primaryViolet} />
              </View>
              <View style={styles.optionTextCol}>
                <Text style={styles.optionLabel}>{opt.label}</Text>
                {opt.hint ? <Text style={styles.optionHint}>{opt.hint}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.gray400} />
            </TouchableOpacity>
          );
        })}
      </View>
    </GestureScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: Layout.spacing.xl, paddingBottom: Layout.spacing.xxl },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  backText: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "600" },
  title: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 8 },
  subtitle: { ...Typography.caption, color: Colors.gray600, marginBottom: 24, lineHeight: 20 },
  options: { gap: 12 },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  optionCardSecondary: {
    justifyContent: "center",
    backgroundColor: Colors.gray100,
  },
  optionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  optionTextCol: { flex: 1, gap: 2 },
  optionLabel: { ...Typography.body, fontWeight: "600", color: Colors.textPrimary },
  optionLabelSecondary: { ...Typography.body, fontWeight: "600", color: Colors.gray700, flex: 1 },
  optionHint: { ...Typography.caption, color: Colors.gray500 },
});
