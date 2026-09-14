import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { GestureScrollView } from "@/components/ui/GestureScrollView";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { TextButton } from "@/components/ds";
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

const SUB_ACTIVITY_META: Record<string, { icon: string; hint?: string }> = {
  "Dinner / Brunch": { icon: "restaurant-outline", hint: "Sit-down meal occasion" },
  "Drinks & bar": { icon: "wine-outline", hint: "Bar, wine bar or pub" },
  Coffee: { icon: "cafe-outline", hint: "Relaxed café meet" },
  "Street food or market": { icon: "storefront-outline", hint: "Markets & food halls" },
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

function buildOptionKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function ConciergeSubActivityStep({
  category,
  onContinue,
  onBack,
  showInlineBack = true,
}: ConciergeSubActivityStepProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const options = useMemo(() => {
    const list = category.subActivities ?? [];
    if (!list.length) {
      return [{ key: "any", label: "Any" }];
    }
    return list.map((label) => ({
      key: buildOptionKey(label),
      label,
    }));
  }, [category.subActivities]);

  const prompt = category.subActivityPrompt?.trim() || `What kind of ${category.label.toLowerCase()}?`;

  const handleSelect = (opt: { key: string; label: string }) => {
    Haptics.selectionAsync();
    onContinue({ subKey: opt.key, subLabel: opt.label });
  };

  return (
    <GestureScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {showInlineBack ? (
        <TextButton
          title="Back"
          icon={<Ionicons name="arrow-back" size={20} color={theme.colors.primary} />}
          onPress={onBack}
          style={styles.backRow}
        />
      ) : null}

      <View style={styles.categoryPill}>
        <View style={styles.categoryIconWrap}>
          <Ionicons name={category.icon as never} size={18} color={theme.colors.primary} />
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
        {options.map((opt) => {
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
                <Ionicons name={meta.icon as never} size={26} color={theme.colors.primary} />
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
    </GestureScrollView>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    content: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.xxl,
      paddingTop: theme.spacing.xs,
    },
    backRow: { alignSelf: "flex-start", marginBottom: theme.spacing.lg, paddingLeft: 0 },
    categoryPill: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.pill,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      marginBottom: theme.spacing.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...theme.elevation(1),
    },
    categoryIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    categoryPillText: {
      ...theme.type.caption,
      fontWeight: "700",
      color: theme.colors.primary,
      maxWidth: 220,
    },
    title: {
      ...theme.type.h1,
      fontSize: 26,
      lineHeight: 32,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.sm,
    },
    subtitle: {
      ...theme.type.body,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.xl,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.md,
    },
    gridCard: {
      width: "47.5%",
      flexGrow: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.lg,
      padding: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      minHeight: 118,
      ...theme.elevation(1),
    },
    gridIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.spacing.sm,
    },
    gridLabel: {
      ...theme.type.body,
      fontWeight: "700",
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.xs,
    },
    gridHint: {
      ...theme.type.caption,
      color: theme.colors.textSecondary,
      lineHeight: 16,
    },
  });
}
