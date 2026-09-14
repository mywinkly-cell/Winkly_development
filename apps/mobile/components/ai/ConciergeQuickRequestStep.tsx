/**
 * Concierge Quick plan — free-text request → structured venue options.
 * City is required; optional radius + map pin bias venue search.
 */

import React, { useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { GestureScrollView } from "@/components/ui/GestureScrollView";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { PrimaryButton } from "@/components/ds";
import { useAppTheme } from "@/constants/design-system";
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
  const theme = useAppTheme();
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
    <GestureScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xxl, paddingTop: 4 }}
      keyboardShouldPersistTaps="handled"
    >
      {showInlineBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backRow} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.primary} />
          <Text style={[theme.type.caption, { color: theme.colors.primary, fontFamily: theme.type.caption.fontFamily, fontWeight: "600" }]}>
            Back
          </Text>
        </TouchableOpacity>
      ) : null}

      <View
        style={{
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.xs,
          backgroundColor: theme.colors.backgroundMuted,
          borderRadius: theme.radii.pill,
          paddingVertical: theme.spacing.xs,
          paddingHorizontal: theme.spacing.md,
          marginBottom: theme.spacing.lg,
        }}
      >
        <Ionicons name="flash" size={16} color={theme.colors.primary} />
        <Text style={[theme.type.caption, { color: theme.colors.primary, fontFamily: theme.type.caption.fontFamily, fontWeight: "700" }]}>
          Quick plan
        </Text>
      </View>

      <Text style={[theme.type.h2, { color: theme.colors.textPrimary, fontFamily: theme.type.h2.fontFamily, marginBottom: theme.spacing.sm }]}>
        What do you want to do?
      </Text>
      <Text
        style={[
          theme.type.body,
          { color: theme.colors.textSecondary, fontFamily: theme.type.body.fontFamily, marginBottom: theme.spacing.lg },
        ]}
      >
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
        style={[
          theme.type.body,
          {
            fontFamily: theme.type.body.fontFamily,
            minHeight: 110,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radii.md,
            padding: theme.spacing.md,
            color: theme.colors.textPrimary,
            backgroundColor: theme.colors.surface,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.sm,
          },
        ]}
        value={query}
        onChangeText={setQuery}
        placeholder="e.g. relaxing massage nearby"
        placeholderTextColor={theme.colors.textMuted}
        multiline
        textAlignVertical="top"
        editable={!generating}
        accessibilityLabel="Quick plan request"
      />

      <View style={{ gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
        {EXAMPLES.map((ex) => (
          <TouchableOpacity
            key={ex}
            style={{
              backgroundColor: theme.colors.backgroundMuted,
              borderRadius: theme.radii.md,
              paddingVertical: theme.spacing.sm,
              paddingHorizontal: theme.spacing.md,
            }}
            onPress={() => {
              Haptics.selectionAsync();
              setQuery(ex);
            }}
            disabled={generating}
            activeOpacity={0.85}
          >
            <Text
              numberOfLines={2}
              style={[theme.type.caption, { color: theme.colors.textSecondary, fontFamily: theme.type.caption.fontFamily, fontWeight: "600" }]}
            >
              {ex}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!cityReady ? (
        <Text
          style={[
            theme.type.caption,
            { color: theme.colors.error, fontFamily: theme.type.caption.fontFamily, marginBottom: theme.spacing.sm, fontWeight: "600" },
          ]}
        >
          Set a city to search.
        </Text>
      ) : null}

      <PrimaryButton
        title="Find options"
        onPress={submit}
        loading={generating}
        disabled={!query.trim() || !cityReady}
        icon={!generating ? <Ionicons name="search" size={18} color={theme.colors.onPrimary} /> : undefined}
        accessibilityLabel="Find options"
      />
    </GestureScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
});
