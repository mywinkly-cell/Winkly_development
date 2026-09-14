// Multi-select "which modes do you want?" step of the onboarding wizard (D1).
// Romance/Friends/Business can each be toggled independently — the data model
// (sub_profiles rows, romanceEnabled/friendsEnabled/businessEnabled) already
// supports having all three enabled; this exposes that during onboarding too.

import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Colors, Typography, FontFamily, Layout } from "@/constants/tokens";
import { Card } from "@/components/ui/Card";
import { ALL_ONBOARDING_MODES, MODE_EMOJI, MODE_LABEL, type PrimaryOnboardingMode } from "@/lib/profile/onboardingWizard";

export function ModeSelectStep(props: {
  enabledModes: Set<PrimaryOnboardingMode>;
  onToggleMode: (mode: PrimaryOnboardingMode) => void;
}) {
  const { enabledModes, onToggleMode } = props;
  return (
    <Card>
      <Text style={{ ...Typography.h3, color: Colors.textSecondary, marginBottom: 8, fontFamily: FontFamily.headingBold }}>
        Set up your profile
      </Text>
      <Text style={{ ...Typography.caption, color: Colors.gray600, marginBottom: 16 }}>
        Pick one or more modes to set up now — you can always add more later from mode selection.
      </Text>

      <View style={{ flexDirection: "row", marginHorizontal: -4 }}>
        {ALL_ONBOARDING_MODES.map((mode) => {
          const selected = enabledModes.has(mode);
          return (
            <TouchableOpacity
              key={mode}
              onPress={() => onToggleMode(mode)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={{
                flex: 1,
                marginHorizontal: 4,
                paddingVertical: 14,
                borderRadius: Layout.radii.control,
                borderWidth: 2,
                borderColor: selected ? Colors.primaryViolet : Colors.gray200,
                backgroundColor: selected ? Colors.primaryViolet + "12" : Colors.white,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 22, marginBottom: 4 }}>{MODE_EMOJI[mode]}</Text>
              <Text style={{ ...Typography.caption, fontWeight: selected ? "700" : "500", color: selected ? Colors.primaryViolet : Colors.textPrimary }}>
                {MODE_LABEL[mode]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {enabledModes.size === 0 && (
        <Text style={{ ...Typography.caption, color: Colors.gray500, marginTop: 12 }}>
          You can skip sub-profiles for now and add one later.
        </Text>
      )}
    </Card>
  );
}
