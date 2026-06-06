// apps/mobile/app/(onboarding-personal)/winkly-world.tsx
// WinklyWorldScreen — Post-onboarding first-time intro
// Personal and Business variants
// ?variant=personal | ?variant=business

import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  StyleSheet,
} from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import * as Haptics from "expo-haptics";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";
import { Routes } from "@/constants/routes";
import { setWinklyWorldSeen, setWinklyWorldDontShow } from "@/lib/introFlags";

type Variant = "personal" | "business";

export default function WinklyWorld() {
  const router = useRouter();
  const params = useLocalSearchParams<{ variant?: string }>();
  const variant: Variant = params.variant === "business" ? "business" : "personal";
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleEnter = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setWinklyWorldSeen();
    if (dontShowAgain) await setWinklyWorldDontShow();
    router.replace(Routes.modeSelection);
  };

  const isPersonal = variant === "personal";

  return (
    <SafeScreenView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Welcome to your Winkly world</Text>

        <Text style={styles.paragraph}>
          You don&apos;t have just one profile. You have modes — each with its own profile, visibility, and intention.
        </Text>

        <Text style={styles.paragraph}>
          Switch modes anytime and control who sees you and how. Winkly is built around clarity, intention, and quality.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your modes</Text>

          {isPersonal ? (
            <>
              <ModeRow icon="heart" label="Romance" />
              <ModeRow icon="people" label="Friends" />
              <ModeRow icon="briefcase" label="Business" sublabel="Available for personal users" />
              <ModeRow icon="calendar" label="Events" />
            </>
          ) : (
            <>
              <ModeRow icon="briefcase" label="Business" />
              <ModeRow icon="calendar" label="Events" />
              <ModeRow icon="people" label="People" sublabel="Discover relevant connections" />
            </>
          )}
        </View>

        <View style={[styles.card, styles.plannerCard]}>
          <Text style={styles.cardTitle}>Planner & AI</Text>
          <Text style={styles.plannerText}>
            {isPersonal
              ? "The AI planner helps discover relevant events, suggest next steps, and plan meetups naturally to move from online to real life."
              : "The AI planner helps discover relevant people and events, plan meetings efficiently, and turn connections into real outcomes."}
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleEnter}
          style={styles.cta}
          activeOpacity={0.9}
        >
          <Text style={styles.ctaText}>Enter Winkly</Text>
        </TouchableOpacity>

        <View style={styles.dontShowRow}>
          <Switch
            value={dontShowAgain}
            onValueChange={(v) => {
              Haptics.selectionAsync();
              setDontShowAgain(v);
            }}
            trackColor={{ false: Colors.gray300, true: Colors.primaryViolet }}
            thumbColor={Colors.white}
          />
          <Text style={styles.dontShowLabel}>Don&apos;t show again</Text>
        </View>
      </ScrollView>
    </SafeScreenView>
  );
}

function ModeRow({
  icon,
  label,
  sublabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
}) {
  return (
    <View style={styles.modeRow}>
      <View style={styles.modeIconWrap}>
        <Ionicons name={icon} size={20} color={Colors.primaryViolet} />
      </View>
      <View style={styles.modeText}>
        <Text style={styles.modeLabel}>{label}</Text>
        {sublabel && <Text style={styles.modeSublabel}>{sublabel}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.backgroundMuted },
  scroll: {
    padding: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  title: {
    fontFamily: FontFamily.heading,
    fontSize: 26,
    lineHeight: 34,
    color: Colors.textPrimary,
    marginBottom: 20,
  },
  paragraph: {
    ...Typography.body,
    color: Colors.gray600,
    lineHeight: 24,
    marginBottom: 16,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    padding: 20,
    marginBottom: 16,
    ...Shadow.card,
  },
  cardTitle: {
    fontFamily: FontFamily.heading,
    fontSize: 18,
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  modeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F5F1FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  modeText: { flex: 1 },
  modeLabel: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  modeSublabel: {
    ...Typography.caption,
    color: Colors.gray600,
    marginTop: 2,
  },
  plannerCard: {
    backgroundColor: "#F5F1FF",
    borderWidth: 1,
    borderColor: Colors.primaryViolet,
  },
  plannerText: {
    ...Typography.body,
    color: Colors.gray700,
    lineHeight: 24,
  },
  cta: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    marginTop: 8,
    ...Shadow.button,
  },
  ctaText: {
    ...Typography.button,
    color: Colors.accentYellow,
    fontFamily: FontFamily.heading,
  },
  dontShowRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    justifyContent: "center",
    gap: 10,
  },
  dontShowLabel: {
    ...Typography.caption,
    color: Colors.gray600,
  },
});
