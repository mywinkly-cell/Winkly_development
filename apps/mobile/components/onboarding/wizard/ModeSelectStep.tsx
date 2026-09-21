// Multi-select "which modes do you want?" step of the onboarding wizard (D1).
// Romance/Friends/Business can each be toggled independently — the data model
// (sub_profiles rows, romanceEnabled/friendsEnabled/businessEnabled) already
// supports having all three enabled; this exposes that during onboarding too.
// Modes that aren't live yet (isModeAvailable) render muted with a "Coming soon"
// badge; tapping them opens the waitlist sheet instead of toggling.

import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "@/constants/design-system";
import { Card } from "@/components/ds";
import { ComingSoonBadge } from "@/components/mode/ComingSoonBadge";
import { BusinessWaitlistSheet } from "@/components/mode/BusinessWaitlistSheet";
import { isModeAvailable } from "@/lib/modes/availability";
import { ALL_ONBOARDING_MODES, MODE_EMOJI, type PrimaryOnboardingMode } from "@/lib/profile/onboardingWizard";

export function ModeSelectStep(props: {
  enabledModes: Set<PrimaryOnboardingMode>;
  onToggleMode: (mode: PrimaryOnboardingMode) => void;
}) {
  const { enabledModes, onToggleMode } = props;
  const { t } = useTranslation();
  const theme = useAppTheme();
  const [waitlistVisible, setWaitlistVisible] = useState(false);

  return (
    <Card>
      <Text style={[theme.type.h3, { color: theme.colors.textPrimary, marginBottom: theme.spacing.sm, fontFamily: theme.type.h3.fontFamily }]}>
        {t("onboarding.modeSelect.title")}
      </Text>
      <Text style={[theme.type.caption, { color: theme.colors.textSecondary, marginBottom: theme.spacing.lg, fontFamily: theme.type.caption.fontFamily }]}>
        {t("onboarding.modeSelect.subtitle")}
      </Text>

      <View style={{ flexDirection: "row", marginHorizontal: -theme.spacing.xs }}>
        {ALL_ONBOARDING_MODES.map((mode) => {
          const comingSoon = !isModeAvailable(mode);
          const selected = !comingSoon && enabledModes.has(mode);
          const label = t(`modes.${mode}`);
          const accent = theme.modeAccent(mode).primary;
          return (
            <Pressable
              key={mode}
              testID={`onboarding-mode-${mode}`}
              onPress={() => (comingSoon ? setWaitlistVisible(true) : onToggleMode(mode))}
              accessibilityRole="button"
              accessibilityLabel={comingSoon ? t("modes.comingSoonA11y", { mode: label }) : label}
              accessibilityState={{ selected }}
              style={{
                flex: 1,
                marginHorizontal: theme.spacing.xs,
                paddingVertical: theme.spacing.md,
                paddingHorizontal: theme.spacing.xs,
                borderRadius: theme.radii.md,
                borderWidth: 2,
                borderColor: selected ? accent : theme.colors.border,
                backgroundColor: comingSoon ? theme.colors.backgroundMuted : theme.colors.surface,
                alignItems: "center",
              }}
            >
              {/* Emoji glyph sized with the h2 scale so it matches the label weight. */}
              <Text style={[theme.type.h2, { marginBottom: theme.spacing.xs, opacity: comingSoon ? 0.5 : 1 }]}>{MODE_EMOJI[mode]}</Text>
              <Text
                numberOfLines={1}
                style={[
                  theme.type.caption,
                  {
                    fontFamily: selected ? theme.fontFamily.bodySemiBold : theme.type.caption.fontFamily,
                    color: comingSoon ? theme.colors.textMuted : selected ? accent : theme.colors.textPrimary,
                  },
                ]}
              >
                {label}
              </Text>
              {comingSoon ? <ComingSoonBadge style={{ marginTop: theme.spacing.xs }} /> : null}
            </Pressable>
          );
        })}
      </View>

      {enabledModes.size === 0 && (
        <Text style={[theme.type.caption, { color: theme.colors.textMuted, marginTop: theme.spacing.md, fontFamily: theme.type.caption.fontFamily }]}>
          {t("onboarding.modeSelect.skipHint")}
        </Text>
      )}

      <BusinessWaitlistSheet visible={waitlistVisible} onClose={() => setWaitlistVisible(false)} />
    </Card>
  );
}
