/**
 * Step 6 — Invite / Share: "Invite someone?" when user hasn't selected participants yet.
 * Options: Matches, Friends, Contacts, Share externally, Skip.
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Share } from "react-native";
import { GestureScrollView } from "@/components/ui/GestureScrollView";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import type { Mode } from "@/types";

const OPTIONS: { key: string; label: string; icon: string }[] = [
  { key: "matches", label: "Matches", icon: "heart-outline" },
  { key: "friends", label: "Friends", icon: "people-outline" },
  { key: "contacts", label: "Contacts", icon: "call-outline" },
  { key: "share_external", label: "Share externally", icon: "share-outline" },
  { key: "skip", label: "Skip", icon: "arrow-forward-outline" },
];

export type ConciergeInviteStepProps = {
  mode: Mode;
  planTitle?: string;
  planLocation?: string;
  planDate?: string;
  planTime?: string;
  onSelect: (choice: "matches" | "friends" | "contacts" | "share_external" | "skip") => void;
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
        Add people to your plan or share it outside Winkly
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
                  <Ionicons name={opt.icon as any} size={24} color={Colors.primaryViolet} />
                </View>
                <Text style={styles.optionLabel}>{opt.label}</Text>
                <Text style={styles.optionHint}>SMS, WhatsApp, etc.</Text>
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
                <Ionicons name={opt.icon as any} size={20} color={Colors.gray600} />
              </TouchableOpacity>
            );
          }
          return (
            <TouchableOpacity
              key={opt.key}
              style={styles.optionCard}
              onPress={() => {
                Haptics.selectionAsync();
                onSelect(opt.key as "matches" | "friends" | "contacts");
              }}
              activeOpacity={0.85}
            >
              <View style={styles.optionIconWrap}>
                <Ionicons name={opt.icon as any} size={24} color={Colors.primaryViolet} />
              </View>
              <Text style={styles.optionLabel}>{opt.label}</Text>
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
  subtitle: { ...Typography.caption, color: Colors.gray600, marginBottom: 24 },
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
  optionLabel: { ...Typography.body, fontWeight: "600", color: Colors.textPrimary, flex: 1 },
  optionLabelSecondary: { ...Typography.body, fontWeight: "600", color: Colors.gray700 },
  optionHint: { ...Typography.caption, color: Colors.gray500 },
});
