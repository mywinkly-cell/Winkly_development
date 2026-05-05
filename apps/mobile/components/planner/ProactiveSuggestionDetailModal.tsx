/**
 * Modal showing full details of a proactive Winkly suggestion.
 * "View plan" opens this so the user sees the actual plan details (not the intent screen).
 * Actions: Add to planner (opens concierge with pre-fill at activity step), Invite someone (opens at social step).
 */

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { Colors, Typography } from "@/constants/tokens";
import type { ProactiveSuggestion } from "@/lib/ai/proactiveSuggestion";

export type ProactiveSuggestionDetailModalProps = {
  visible: boolean;
  suggestion: ProactiveSuggestion;
  accentColor?: string;
  /** Opens concierge with this suggestion pre-filled; initial_step "activity" so user sees details then can generate. */
  onAddToPlanner: (suggestion: ProactiveSuggestion) => void;
  /** Opens concierge with this suggestion pre-filled; initial_step "social" so user sees Who is joining / invite list. */
  onInviteSomeone: (suggestion: ProactiveSuggestion) => void;
  onDismiss: () => void;
};

export function ProactiveSuggestionDetailModal({
  visible,
  suggestion,
  accentColor = Colors.primaryViolet,
  onAddToPlanner,
  onInviteSomeone,
  onDismiss,
}: ProactiveSuggestionDetailModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.backdrop} onPress={() => { Haptics.selectionAsync(); onDismiss(); }}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={[styles.badge, { backgroundColor: accentColor + "18" }]}>
              <SparklesIcon size={18} color={accentColor} />
              <Text style={[styles.badgeText, { color: accentColor }]}>Winkly suggestion</Text>
            </View>
            <TouchableOpacity
              onPress={() => { Haptics.selectionAsync(); onDismiss(); }}
              hitSlop={12}
              style={styles.closeBtn}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={24} color={Colors.gray500} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>{suggestion.title}</Text>
            {suggestion.subtitle ? (
              <Text style={styles.subtitle}>{suggestion.subtitle}</Text>
            ) : null}

            <Text style={styles.sectionLabel}>What&apos;s included</Text>
            <View style={styles.activities}>
              {suggestion.activities.map((a, i) => (
                <View key={i} style={styles.activityRow}>
                  <Ionicons name="checkmark-circle" size={20} color={accentColor} style={styles.activityIcon} />
                  <Text style={styles.activityText}>{a}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionLabel}>When</Text>
            <Text style={styles.timeRange}>{suggestion.timeRange}</Text>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: accentColor }]}
              onPress={() => { Haptics.selectionAsync(); onAddToPlanner(suggestion); onDismiss(); }}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryBtnText}>Add to planner</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => { Haptics.selectionAsync(); onInviteSomeone(suggestion); onDismiss(); }}
              activeOpacity={0.8}
            >
              <Ionicons name="person-add-outline" size={20} color={accentColor} />
              <Text style={[styles.secondaryBtnText, { color: accentColor }]}>Invite someone</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    width: "100%",
    maxWidth: 400,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  badgeText: {
    ...Typography.caption,
    fontWeight: "700",
  },
  closeBtn: { padding: 4 },
  scroll: { maxHeight: 320 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 16 },
  title: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.gray600,
    marginBottom: 16,
  },
  sectionLabel: {
    ...Typography.caption,
    color: Colors.gray500,
    fontWeight: "600",
    marginBottom: 8,
  },
  activities: { marginBottom: 16 },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  activityIcon: { marginRight: 10 },
  activityText: {
    ...Typography.body,
    color: Colors.textPrimary,
    flex: 1,
  },
  timeRange: {
    ...Typography.body,
    color: Colors.textPrimary,
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.gray200,
  },
  primaryBtn: {
    flex: 1,
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
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  secondaryBtnText: {
    ...Typography.caption,
    fontWeight: "600",
  },
});
