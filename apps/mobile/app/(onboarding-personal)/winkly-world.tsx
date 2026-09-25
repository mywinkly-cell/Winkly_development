// apps/mobile/app/(onboarding-personal)/winkly-world.tsx
// WinklyWorldScreen — Post-onboarding first-time intro
// Personal and Business variants
// ?variant=personal | ?variant=business

import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Switch,
  StyleSheet,
} from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import * as Haptics from "expo-haptics";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Card, ListRow, PrimaryButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { Routes } from "@/constants/routes";
import { setWinklyWorldSeen, setWinklyWorldDontShow } from "@/lib/introFlags";
import { trackOnboardingCompleted } from "@/lib/analytics/events";

type Variant = "personal" | "business";

export default function WinklyWorld() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const params = useLocalSearchParams<{ variant?: string }>();
  const variant: Variant = params.variant === "business" ? "business" : "personal";
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleEnter = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setWinklyWorldSeen();
    if (dontShowAgain) await setWinklyWorldDontShow();
    trackOnboardingCompleted({ account_type: variant });
    router.replace(Routes.modeSelection);
  };

  const isPersonal = variant === "personal";

  return (
    <SafeScreenView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t("onboarding.winklyWorld.title")}</Text>

        <Text style={styles.paragraph}>{t("onboarding.winklyWorld.body1")}</Text>

        <Text style={styles.paragraph}>{t("onboarding.winklyWorld.body2")}</Text>

        <Card padding="lg" style={styles.card}>
          <Text style={styles.cardTitle}>{t("onboarding.winklyWorld.yourModes")}</Text>

          {isPersonal ? (
            <>
              <ModeRow icon="heart" label={t("modes.romance")} theme={theme} />
              <ModeRow icon="people" label={t("modes.friends")} theme={theme} />
              <ModeRow
                icon="briefcase"
                label={t("modes.business")}
                sublabel={t("onboarding.winklyWorld.businessForPersonal")}
                theme={theme}
              />
              <ModeRow icon="calendar" label={t("modes.events")} theme={theme} />
            </>
          ) : (
            <>
              <ModeRow icon="briefcase" label={t("modes.business")} theme={theme} />
              <ModeRow icon="calendar" label={t("modes.events")} theme={theme} />
              <ModeRow
                icon="people"
                label={t("onboarding.winklyWorld.people")}
                sublabel={t("onboarding.winklyWorld.peopleSub")}
                theme={theme}
              />
            </>
          )}
        </Card>

        <Card padding="lg" style={{ ...styles.card, ...styles.plannerCard }}>
          <Text style={styles.cardTitle}>{t("onboarding.winklyWorld.plannerTitle")}</Text>
          <Text style={styles.plannerText}>
            {isPersonal ? t("onboarding.winklyWorld.plannerPersonal") : t("onboarding.winklyWorld.plannerBusiness")}
          </Text>
        </Card>

        <PrimaryButton title={t("onboarding.winklyWorld.enter")} onPress={handleEnter} style={styles.cta} />

        <View style={styles.dontShowRow}>
          <Switch
            value={dontShowAgain}
            onValueChange={(v) => {
              Haptics.selectionAsync();
              setDontShowAgain(v);
            }}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
            thumbColor={theme.colors.onPrimary}
          />
          <Text style={styles.dontShowLabel}>{t("onboarding.winklyWorld.dontShowAgain")}</Text>
        </View>
      </ScrollView>
    </SafeScreenView>
  );
}

function ModeRow({
  icon,
  label,
  sublabel,
  theme,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  theme: AppTheme;
}) {
  return (
    <ListRow
      title={label}
      subtitle={sublabel}
      style={{ paddingHorizontal: 0, paddingVertical: theme.spacing.xs }}
      leading={
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: theme.radii.pill,
            backgroundColor: theme.colors.primary + "12",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={icon} size={20} color={theme.colors.primary} />
        </View>
      }
    />
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.backgroundMuted },
    scroll: {
      padding: theme.spacing.xl,
      paddingBottom: theme.spacing.huge,
    },
    title: {
      ...theme.type.h1,
      fontFamily: theme.type.h1.fontFamily,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.xl,
    },
    paragraph: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.md,
    },
    card: { marginBottom: theme.spacing.md },
    cardTitle: {
      ...theme.type.h3,
      fontFamily: theme.type.h3.fontFamily,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.md,
    },
    plannerCard: {
      backgroundColor: theme.colors.primary + "10",
      borderWidth: 1,
      borderColor: theme.colors.primary,
    },
    plannerText: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textSecondary,
    },
    cta: { marginTop: theme.spacing.xs },
    dontShowRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: theme.spacing.xl,
      justifyContent: "center",
      gap: theme.spacing.sm,
    },
    dontShowLabel: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
    },
  });
}
