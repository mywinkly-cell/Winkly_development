// Final read-only review/summary step of the onboarding wizard (D1).
// Each section has an "Edit" link that jumps back to the relevant step.

import React from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Colors, Typography, FontFamily, Layout } from "@/constants/tokens";
import { Card } from "@/components/ui/Card";
import { MODE_EMOJI, MODE_LABEL_KEY, type PrimaryOnboardingMode } from "@/lib/profile/onboardingWizard";

function ReviewRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: "row", marginBottom: 6 }}>
      <Text style={{ ...Typography.caption, color: Colors.gray600, width: 100 }}>{label}</Text>
      <Text style={{ ...Typography.body, color: Colors.textPrimary, flex: 1 }}>{value}</Text>
    </View>
  );
}

function ReviewSection(props: { title: string; onEdit: () => void; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <Card style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <Text style={{ ...Typography.h3, color: Colors.textSecondary, fontFamily: FontFamily.headingBold }}>{props.title}</Text>
        <TouchableOpacity
          onPress={props.onEdit}
          style={{ flexDirection: "row", alignItems: "center" }}
          accessibilityRole="button"
          accessibilityLabel={t("onboarding.review.editA11y", { section: props.title })}
        >
          <Ionicons name="pencil" size={14} color={Colors.primaryViolet} style={{ marginRight: 4 }} />
          <Text style={{ ...Typography.caption, color: Colors.primaryViolet, fontWeight: "600" }}>{t("common.edit")}</Text>
        </TouchableOpacity>
      </View>
      {props.children}
    </Card>
  );
}

export function ReviewStep(props: {
  onEditGeneral: () => void;
  firstName: string;
  lastName: string;
  birthdayLabel: string;
  city: string;
  gender: string;
  corePhotos: string[];

  enabledModes: PrimaryOnboardingMode[];
  onEditMode: (mode: PrimaryOnboardingMode) => void;
  modeSummary: Record<PrimaryOnboardingMode, { bio: string; photos: (string | null)[] }>;
}) {
  const { onEditGeneral, firstName, lastName, birthdayLabel, city, gender, corePhotos } = props;
  const { enabledModes, onEditMode, modeSummary } = props;
  const { t } = useTranslation();

  return (
    <View>
      <Text style={{ ...Typography.h3, color: Colors.textSecondary, marginBottom: 4, fontFamily: FontFamily.headingBold }}>
        {t("onboarding.review.title")}
      </Text>
      <Text style={{ ...Typography.caption, color: Colors.gray600, marginBottom: 16 }}>
        {t("onboarding.review.subtitle")}
      </Text>

      <ReviewSection title={t("onboarding.review.general")} onEdit={onEditGeneral}>
        {corePhotos.length > 0 && (
          <View style={{ flexDirection: "row", marginBottom: 10 }}>
            {corePhotos.slice(0, 5).map((uri, i) => (
              <Image key={`${uri}-${i}`} source={{ uri }} style={{ width: 56, height: 56, borderRadius: 10, marginRight: 8 }} />
            ))}
          </View>
        )}
        <ReviewRow label={t("onboarding.review.name")} value={t("onboarding.review.fullName", { first: firstName, last: lastName }).trim()} />
        <ReviewRow label={t("profile.birthday")} value={birthdayLabel} />
        <ReviewRow label={t("profile.city")} value={city} />
        <ReviewRow label={t("profile.gender")} value={gender} />
      </ReviewSection>

      {enabledModes.map((mode) => {
        const summary = modeSummary[mode];
        return (
          <ReviewSection key={mode} title={`${MODE_EMOJI[mode]} ${t(MODE_LABEL_KEY[mode])}`} onEdit={() => onEditMode(mode)}>
            {summary.photos.some(Boolean) && (
              <View style={{ flexDirection: "row", marginBottom: 10 }}>
                {summary.photos.filter(Boolean).map((uri, i) => (
                  <Image key={`${uri}-${i}`} source={{ uri: uri as string }} style={{ width: 56, height: 56, borderRadius: 10, marginRight: 8 }} />
                ))}
              </View>
            )}
            <ReviewRow label={t("profile.bio")} value={summary.bio} />
          </ReviewSection>
        );
      })}
    </View>
  );
}
