/**
 * Concierge Quick plan — free-text request → structured venue options.
 * City is required; optional radius + map pin bias venue search.
 */

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { GestureScrollView } from "@/components/ui/GestureScrollView";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";
import {
  PlanningLocationFields,
  type PlanningLocationValue,
} from "@/components/ai/PlanningLocationFields";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";

export type ConciergeQuickRequestStepProps = {
  initialQuery?: string;
  location: PlanningLocationValue;
  onLocationChange: (next: PlanningLocationValue) => void;
  language?: string;
  onGenerate: (query: string) => void;
  onBack: () => void;
  showInlineBack?: boolean;
  generating?: boolean;
};

const EXAMPLES = [
  "Relaxing massage nearby",
  "Good coffee for a quiet laptop afternoon",
  "Casual dinner tonight under €40",
];

export function ConciergeQuickRequestStep({
  initialQuery = "",
  location,
  onLocationChange,
  language = "en",
  onGenerate,
  onBack,
  showInlineBack = true,
  generating = false,
}: ConciergeQuickRequestStepProps) {
  const [query, setQuery] = useState(initialQuery);

  const cityReady = useMemo(() => {
    const line = normalizeLocationDisplayString(location.location ?? "", language).trim();
    return line.length >= 2;
  }, [location.location, language]);

  const submit = () => {
    const q = query.trim();
    if (!q || !cityReady || generating) return;
    Haptics.selectionAsync();
    onGenerate(q);
  };

  return (
    <GestureScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {showInlineBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backRow} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color={Colors.primaryViolet} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.pill}>
        <Ionicons name="flash" size={16} color={Colors.primaryViolet} />
        <Text style={styles.pillText}>Quick plan</Text>
      </View>

      <Text style={styles.title}>What do you want to do?</Text>
      <Text style={styles.subtitle}>
        Type it like a search — we&apos;ll suggest real places in your chosen city
        {location.searchRadiusKm ? ` within ${location.searchRadiusKm} km` : ""}.
      </Text>

      <PlanningLocationFields
        value={location}
        onChange={onLocationChange}
        language={language}
        compact
      />

      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder="e.g. relaxing massage nearby"
        placeholderTextColor={Colors.gray500}
        multiline
        textAlignVertical="top"
        editable={!generating}
        accessibilityLabel="Quick plan request"
      />

      <View style={styles.examples}>
        {EXAMPLES.map((ex) => (
          <TouchableOpacity
            key={ex}
            style={styles.exampleChip}
            onPress={() => {
              Haptics.selectionAsync();
              setQuery(ex);
            }}
            disabled={generating}
            activeOpacity={0.85}
          >
            <Text style={styles.exampleText} numberOfLines={2}>{ex}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!cityReady ? (
        <Text style={styles.needCity}>Set a city to search.</Text>
      ) : null}

      <TouchableOpacity
        style={[styles.cta, (!query.trim() || !cityReady || generating) && styles.ctaDisabled]}
        onPress={submit}
        disabled={!query.trim() || !cityReady || generating}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel="Find options"
      >
        {generating ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <>
            <Ionicons name="search" size={20} color={Colors.white} />
            <Text style={styles.ctaText}>Find options</Text>
          </>
        )}
      </TouchableOpacity>
    </GestureScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: Layout.spacing.xl,
    paddingBottom: Layout.spacing.xxl,
    paddingTop: 4,
  },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "600" },
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.secondaryViolet,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  pillText: {
    ...Typography.caption,
    fontWeight: "700",
    color: Colors.primaryViolet,
  },
  title: {
    fontFamily: FontFamily.headingBold,
    fontSize: 26,
    lineHeight: 32,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.gray600,
    marginBottom: 16,
    lineHeight: 22,
  },
  input: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: 16,
    padding: 14,
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.white,
    marginBottom: 14,
    marginTop: 8,
  },
  examples: { gap: 8, marginBottom: 12 },
  exampleChip: {
    backgroundColor: Colors.gray100,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  exampleText: {
    ...Typography.caption,
    color: Colors.gray700,
    fontWeight: "600",
  },
  needCity: {
    ...Typography.caption,
    color: Colors.errorRed,
    marginBottom: 8,
    fontWeight: "600",
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primaryViolet,
    borderRadius: 14,
    paddingVertical: 14,
  },
  ctaDisabled: { opacity: 0.45 },
  ctaText: {
    ...Typography.button,
    color: Colors.white,
  },
});
