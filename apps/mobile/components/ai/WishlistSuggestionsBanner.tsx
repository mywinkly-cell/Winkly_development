// apps/mobile/components/ai/WishlistSuggestionsBanner.tsx
// Shown above AI plan options when places saved in your wish list — or shared by the person
// you're planning with — fit this plan: "Hey, there are places in your wish lists — how
// about visiting X? Or see the other ideas below." Tapping one re-plans around it.

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ds";
import { useAppTheme } from "@/constants/design-system";
import { VenuePhoto } from "@/components/ui/VenuePhoto";
import type { WishlistSuggestion } from "@/lib/ai/conciergeClient";

type Props = {
  suggestions: WishlistSuggestion[];
  /** Re-plan with this place as the venue. */
  onPlanAround: (s: WishlistSuggestion) => void;
  /** First name of the person you're planning with, if any. */
  partnerName?: string | null;
};

const MAX_SHOWN = 3;

export function WishlistSuggestionsBanner({ suggestions, onPlanAround, partnerName }: Props) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  if (!suggestions.length) return null;
  const shown = suggestions.slice(0, MAX_SHOWN);
  const first = shown[0];
  const hasPartnerItems = shown.some((s) => s.owner !== "you");

  const ownerLabel = (s: WishlistSuggestion) =>
    s.owner === "both"
      ? t("planWishlist.savedByBoth")
      : s.owner === "partner"
        ? partnerName
          ? t("planWishlist.savedByName", { name: partnerName })
          : t("planWishlist.savedByThem")
        : t("planWishlist.savedByYou");

  return (
    <Card padding="md" style={{ marginBottom: theme.spacing.lg, borderWidth: 1, borderColor: theme.colors.primary }}>
      <View style={styles.headRow}>
        <Ionicons name="bookmark" size={18} color={theme.colors.primary} />
        <Text style={[theme.type.bodyMedium, { color: theme.colors.textPrimary, flex: 1 }]}>
          {hasPartnerItems ? t("planWishlist.titleShared") : t("planWishlist.title")}
        </Text>
      </View>
      <Text style={[theme.type.body, { color: theme.colors.textSecondary, marginBottom: theme.spacing.sm }]}>
        {t("planWishlist.body", { place: first.title })}
      </Text>
      {shown.map((s) => (
        <Pressable
          key={s.ref}
          onPress={() => {
            Haptics.selectionAsync();
            onPlanAround(s);
          }}
          style={({ pressed }) => [styles.row, { opacity: pressed ? 0.8 : 1, borderTopColor: theme.colors.border }]}
          accessibilityRole="button"
          accessibilityLabel={t("planWishlist.planAroundA11y", { place: s.title })}
        >
          <VenuePhoto
            source={{ imageUrl: s.image_url, placeId: s.place_id, name: s.title, city: s.city }}
            style={[styles.thumb, { borderRadius: theme.radii.md }]}
            width={200}
            icon="bookmark-outline"
          />
          <View style={{ flex: 1 }}>
            <Text style={[theme.type.bodyMedium, { color: theme.colors.textPrimary }]} numberOfLines={1}>
              {s.title}
            </Text>
            <Text style={[theme.type.caption, { color: theme.colors.textSecondary }]} numberOfLines={1}>
              {[ownerLabel(s), s.address ?? s.city].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <Text style={[theme.type.caption, { color: theme.colors.primary, fontWeight: "700" }]}>
            {t("planWishlist.planAround")}
          </Text>
        </Pressable>
      ))}
      <Text style={[theme.type.caption, { color: theme.colors.textMuted, marginTop: theme.spacing.sm }]}>
        {t("planWishlist.orOthers")}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  thumb: { width: 52, height: 52 },
});
