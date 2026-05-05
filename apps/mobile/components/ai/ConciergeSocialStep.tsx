/**
 * Step 3 — Social Context: "Who is joining you?"
 * Suggested people first, then options: Just me, Invite match/friends/…, Decide later.
 * Share is only available after the plan is confirmed (Add to planner step).
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
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
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {showInlineBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backRow} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color={Colors.primaryViolet} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.title}>Who is joining you?</Text>
      <Text style={styles.subtitle}>
        Add people to your plan or skip to generate
      </Text>

      {suggestedPeople.length > 0 ? (
        <View style={styles.suggestedSection}>
          <Text style={styles.suggestedLabel}>Suggested</Text>
          {suggestedPeople.slice(0, 2).map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.suggestedCard}
              onPress={() => {
                Haptics.selectionAsync();
                onSelect(
                  mode === "romance" ? "invite_match" : mode === "business" ? "invite_business" : "invite_friends",
                  p.id
                );
              }}
              activeOpacity={0.85}
            >
              <Avatar uri={p.avatar_url} size={40} />
              <View style={styles.suggestedTextWrap}>
                <Text style={styles.suggestedName} numberOfLines={1}>{p.displayName}</Text>
                <Text style={styles.suggestedMeta}>
                  {p.type === "match" ? "Recent match" : p.type === "business" ? "Business contact" : "Friend nearby"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={styles.options}>
        {OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={styles.optionCard}
            onPress={() => {
              Haptics.selectionAsync();
              onSelect(opt.key, undefined);
            }}
            activeOpacity={0.85}
          >
            <View style={styles.optionIconWrap}>
              <Ionicons name={opt.icon as any} size={24} color={Colors.primaryViolet} />
            </View>
            <Text style={styles.optionLabel}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
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
  optionHint: { ...Typography.caption, color: Colors.gray500 },
  suggestedSection: { marginBottom: 20 },
  suggestedLabel: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.gray600,
    marginBottom: 10,
  },
  suggestedCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  suggestedTextWrap: { flex: 1, marginLeft: 12 },
  suggestedName: { ...Typography.body, fontWeight: "600", color: Colors.textPrimary },
  suggestedMeta: { ...Typography.caption, color: Colors.gray500, marginTop: 2 },
});
