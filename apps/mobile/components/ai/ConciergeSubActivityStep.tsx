import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { GestureScrollView } from "@/components/ui/GestureScrollView";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";
import type { ActivityCategory } from "@/lib/ai/conciergePlanningFlow";

export type SubActivityContinuePayload = {
  subKey: string;
  subLabel: string;
};

export type ConciergeSubActivityStepProps = {
  category: ActivityCategory;
  onContinue: (payload: SubActivityContinuePayload) => void;
  onBack: () => void;
  /** When false, parent shows the back control (e.g. flow header). */
  showInlineBack?: boolean;
};

const SURPRISE_LABEL = "Surprise me";

const SUB_ACTIVITY_META: Record<string, { icon: string; hint?: string }> = {
  "Dinner / Brunch": { icon: "restaurant-outline", hint: "Sit-down meal occasion" },
  "Drinks & bar": { icon: "wine-outline", hint: "Bar, wine bar or pub" },
  Coffee: { icon: "cafe-outline", hint: "Relaxed café meet" },
  "Street food or market": { icon: "storefront-outline", hint: "Markets & food halls" },
  [SURPRISE_LABEL]: { icon: "sparkles-outline", hint: "AI picks the perfect plan" },
  "Theatre / show": { icon: "ticket-outline", hint: "Live performance" },
  "Museum / gallery": { icon: "images-outline", hint: "Explore exhibits" },
  Cinema: { icon: "film-outline", hint: "Movie outing" },
  Exhibition: { icon: "easel-outline", hint: "Special show or fair" },
  "Opera / classical": { icon: "musical-notes-outline", hint: "Classical performance" },
  "Tennis / padel": { icon: "tennisball-outline", hint: "Court sport" },
  Bowling: { icon: "bowling-ball-outline", hint: "Lanes & friendly competition" },
  "Cycling route": { icon: "bicycle-outline", hint: "Scenic ride together" },
  "Evening stroll": { icon: "walk-outline", hint: "Relaxed walk at dusk" },
  "Indoor climbing": { icon: "trending-up-outline", hint: "Bouldering or climbing gym" },
  "Social dance / class": { icon: "body-outline", hint: "Learn steps together" },
  "Live jazz bar": { icon: "musical-note-outline", hint: "Intimate live music" },
  "Acoustic set": { icon: "mic-outline", hint: "Small venue performance" },
  "Salsa / latin night": { icon: "flame-outline", hint: "Latin dance night" },
  "Cooking class": { icon: "restaurant-outline", hint: "Hands-on kitchen session" },
  "Tasting flight": { icon: "wine-outline", hint: "Curated tasting experience" },
  "Boat / mini-excursion": { icon: "boat-outline", hint: "Short scenic trip" },
  "Photography walk": { icon: "camera-outline", hint: "Explore with your camera" },
  "Spa / massage": { icon: "flower-outline", hint: "Relax and recharge" },
  "Sauna / bath": { icon: "water-outline", hint: "Thermal or sauna session" },
  "Meditation / breathwork": { icon: "leaf-outline", hint: "Calm, mindful session" },
  "Thermal day pass": { icon: "sunny-outline", hint: "Full-day wellness venue" },
  "Creative workshop": { icon: "brush-outline", hint: "Team creative session" },
  "Strategy day space": { icon: "bulb-outline", hint: "Focused offsite room" },
  "Retreat-style venue": { icon: "home-outline", hint: "Away-from-office setting" },
  "Team rituals block": { icon: "people-outline", hint: "Structured team time" },
  Hike: { icon: "trail-sign-outline", hint: "Trail or nature walk" },
  Picnic: { icon: "basket-outline", hint: "Outdoor food & blankets" },
  "Beach or waterfront": { icon: "water-outline", hint: "Coastal hangout" },
  "Park stroll": { icon: "leaf-outline", hint: "Easy walk in the park" },
  "Scenic viewpoint": { icon: "eye-outline", hint: "Photo-worthy lookout" },
  "Board-game café": { icon: "dice-outline", hint: "Games over drinks" },
  Arcade: { icon: "game-controller-outline", hint: "Classic arcade fun" },
  "Escape room": { icon: "key-outline", hint: "Puzzle adventure" },
  "Mini golf": { icon: "golf-outline", hint: "Light-hearted competition" },
  "Watch a match": { icon: "tv-outline", hint: "Live sport viewing" },
  "Casual padel / hoops": { icon: "basketball-outline", hint: "Pick-up sport" },
  "Running buddy laps": { icon: "footsteps-outline", hint: "Run together" },
  "Ice skating": { icon: "snow-outline", hint: "Rink session" },
  "Live gig": { icon: "musical-notes-outline", hint: "Concert or live set" },
  "DJ night": { icon: "disc-outline", hint: "Club or dance floor" },
  "Karaoke room": { icon: "mic-outline", hint: "Private karaoke session" },
  "Late bites after show": { icon: "fast-food-outline", hint: "Post-show food run" },
  "Gym buddy slot": { icon: "barbell-outline", hint: "Work out together" },
  "Yoga / pilates": { icon: "body-outline", hint: "Studio class" },
  "HIIT class": { icon: "flash-outline", hint: "High-intensity session" },
  "Recovery stretch / sauna": { icon: "fitness-outline", hint: "Active recovery" },
  "Quick espresso": { icon: "cafe-outline", hint: "Short focused meet" },
  "Long catch-up": { icon: "chatbubbles-outline", hint: "Unhurried conversation" },
  "Quiet laptop-friendly café": { icon: "laptop-outline", hint: "Work-friendly setting" },
  "Specialty tasting flight": { icon: "wine-outline", hint: "Curated coffee or tea" },
  "Business lunch restaurant": { icon: "restaurant-outline", hint: "Sit-down business lunch" },
  "Casual counter-order": { icon: "fast-food-outline", hint: "Quick casual lunch" },
  "Outdoor terrace lunch": { icon: "sunny-outline", hint: "Al fresco dining" },
  "Full round": { icon: "golf-outline", hint: "18-hole round" },
  "Driving range session": { icon: "golf-outline", hint: "Practice at the range" },
  "Clubhouse drinks round": { icon: "beer-outline", hint: "Post-game drinks" },
  "Short lesson + range": { icon: "school-outline", hint: "Coaching plus practice" },
  "Conference / summit": { icon: "podium-outline", hint: "Large industry event" },
  "Meetup talk": { icon: "megaphone-outline", hint: "Community talk or panel" },
  "Trade fair floor": { icon: "storefront-outline", hint: "Expo or trade show" },
  "Afterparty networking": { icon: "people-outline", hint: "Post-event mingle" },
  "Park loop agenda": { icon: "walk-outline", hint: "Walking meeting loop" },
  "Waterfront stride": { icon: "water-outline", hint: "Scenic walking route" },
  "Coffee-to-stroll": { icon: "cafe-outline", hint: "Coffee then a walk" },
  "Standing walking meeting": { icon: "footsteps-outline", hint: "Walk while you talk" },
  "Client dinner": { icon: "restaurant-outline", hint: "Formal client meal" },
  "Team celebration": { icon: "sparkles-outline", hint: "Celebrate together" },
  "Quiet steakhouse": { icon: "restaurant-outline", hint: "Low-key upscale dinner" },
  "Chef's table style": { icon: "star-outline", hint: "Premium dining experience" },
  Any: { icon: "ellipse-outline", hint: "Open to anything" },
};

function getSubActivityMeta(label: string, category: ActivityCategory) {
  return SUB_ACTIVITY_META[label] ?? { icon: category.icon, hint: undefined };
}

function buildOptionKey(label: string, categoryKey: string): string {
  if (label === SURPRISE_LABEL) {
    return categoryKey === "food_drinks" || categoryKey === "dinner_drinks"
      ? "surprise_me"
      : "any";
  }
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function ConciergeSubActivityStep({
  category,
  onContinue,
  onBack,
  showInlineBack = true,
}: ConciergeSubActivityStepProps) {
  const { regularOptions, surpriseOption } = useMemo(() => {
    const list = category.subActivities ?? [];
    if (!list.length) {
      return {
        regularOptions: [{ key: "any", label: "Any" }],
        surpriseOption: null as { key: string; label: string } | null,
      };
    }

    const mapped = list.map((label) => ({
      key: buildOptionKey(label, category.key),
      label,
    }));
    const surpriseIdx = mapped.findIndex((opt) => opt.label === SURPRISE_LABEL);
    if (surpriseIdx < 0) {
      return { regularOptions: mapped, surpriseOption: null };
    }
    return {
      regularOptions: mapped.filter((opt) => opt.label !== SURPRISE_LABEL),
      surpriseOption: mapped[surpriseIdx],
    };
  }, [category.key, category.subActivities]);

  const prompt = category.subActivityPrompt?.trim() || `What kind of ${category.label.toLowerCase()}?`;

  const handleSelect = (opt: { key: string; label: string }) => {
    Haptics.selectionAsync();
    onContinue({ subKey: opt.key, subLabel: opt.label });
  };

  return (
    <GestureScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {showInlineBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backRow} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color={Colors.primaryViolet} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.categoryPill}>
        <View style={styles.categoryIconWrap}>
          <Ionicons name={category.icon as never} size={18} color={Colors.primaryViolet} />
        </View>
        <Text style={styles.categoryPillText} numberOfLines={1}>
          {category.label}
        </Text>
      </View>

      <Text style={styles.title} numberOfLines={3}>
        {prompt}
      </Text>
      <Text style={styles.subtitle}>Pick the vibe — we&apos;ll handle the rest</Text>

      <View style={styles.grid}>
        {regularOptions.map((opt) => {
          const meta = getSubActivityMeta(opt.label, category);
          return (
            <TouchableOpacity
              key={opt.key}
              style={styles.gridCard}
              onPress={() => handleSelect(opt)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              accessibilityHint={meta.hint}
            >
              <View style={styles.gridIconWrap}>
                <Ionicons name={meta.icon as never} size={26} color={Colors.primaryViolet} />
              </View>
              <Text style={styles.gridLabel} numberOfLines={2}>
                {opt.label}
              </Text>
              {meta.hint ? (
                <Text style={styles.gridHint} numberOfLines={2}>
                  {meta.hint}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {surpriseOption ? (
        <TouchableOpacity
          style={styles.surpriseCard}
          onPress={() => handleSelect(surpriseOption)}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel={surpriseOption.label}
          accessibilityHint={SUB_ACTIVITY_META[SURPRISE_LABEL]?.hint}
        >
          <View style={styles.surpriseIconWrap}>
            <Ionicons name="sparkles" size={24} color={Colors.primaryViolet} />
          </View>
          <View style={styles.surpriseTextWrap}>
            <Text style={styles.surpriseLabel}>{surpriseOption.label}</Text>
            <Text style={styles.surpriseHint}>Let Winkly AI choose the best format for you</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.secondaryViolet} />
        </TouchableOpacity>
      ) : null}
    </GestureScrollView>
  );
}

const CARD_SHADOW = {
  shadowColor: "#1C1C1E",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
  elevation: 3,
} as const;

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: Layout.spacing.xl,
    paddingBottom: Layout.spacing.xxl,
    paddingTop: 4,
  },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "600" },
  categoryPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.white,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
    marginBottom: 16,
  },
  categoryIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
  },
  categoryPillText: {
    ...Typography.caption,
    fontWeight: "700",
    color: Colors.primaryViolet,
  },
  title: {
    ...Typography.h3,
    fontFamily: FontFamily.heading,
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.gray600,
    marginBottom: 20,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 12,
  },
  gridCard: {
    width: "47%",
    minWidth: 140,
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.gray200,
    alignItems: "center",
    ...CARD_SHADOW,
  },
  gridIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  gridLabel: {
    ...Typography.caption,
    fontWeight: "700",
    color: Colors.textPrimary,
    textAlign: "center",
    marginBottom: 4,
  },
  gridHint: {
    ...Typography.caption,
    fontSize: 11,
    lineHeight: 15,
    color: Colors.gray600,
    textAlign: "center",
  },
  surpriseCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F3E8FF",
    borderRadius: Layout.radii.card,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#E9D5FF",
    ...CARD_SHADOW,
  },
  surpriseIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  surpriseTextWrap: { flex: 1 },
  surpriseLabel: {
    ...Typography.body,
    fontWeight: "700",
    color: Colors.primaryViolet,
    marginBottom: 2,
  },
  surpriseHint: {
    ...Typography.caption,
    fontSize: 12,
    color: Colors.secondaryViolet,
  },
});
