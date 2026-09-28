// apps/mobile/app/wishlist/details.tsx
// A saved place: photo, where it is, where you found it, who it's shared with — and
// "Plan a visit", which opens the new-plan form (just me / date / meetup…).

import React, { useCallback, useState } from "react";
import { View, Text, Pressable, Alert, Linking, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Header, Screen, PrimaryButton, SecondaryButton, Chip, Card } from "@/components/ds";
import { useAppTheme } from "@/constants/design-system";
import { VenuePhoto } from "@/components/ui/VenuePhoto";
import { SHARE_MODE_LABEL_KEYS } from "@/components/wishlist/WishlistForm";
import { useModeContext } from "@/providers/ModeContextProvider";
import { newPlanHref } from "@/lib/planner/newPlan";
import { formatAppDate, useAppLocaleTag } from "@/lib/i18n/appLocale";
import {
  deleteWishlistItem,
  getWishlistItem,
  markWishlistItemVisited,
  updateWishlistItem,
  SHAREABLE_MODES,
  type ShareableMode,
  type WishlistItem,
} from "@/lib/wishlistStore";

export default function WishlistDetails() {
  const router = useRouter();
  const theme = useAppTheme();
  const { t } = useTranslation();
  const locale = useAppLocaleTag();
  const { context } = useModeContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<WishlistItem | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void getWishlistItem(String(id))
        .then((found) => {
          if (!cancelled) setItem(found);
        })
        .catch(() => {
          if (!cancelled) setItem(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [id])
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <Header onBack title={t("wishlist.title")} />
        <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: theme.spacing.xxl }} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <Header onBack title={t("wishlist.title")} />
        <Text style={[theme.type.body, { color: theme.colors.textSecondary, padding: theme.spacing.xl }]}>
          {t("wishlist.notFound")}
        </Text>
      </View>
    );
  }

  const where = [item.address, item.city].filter(Boolean).join(", ");
  const link = item.sourceUrl ?? item.url;
  const shareable = SHAREABLE_MODES.filter((m) => context.permissions.includes(m));

  const toggleShare = async (m: ShareableMode) => {
    const next = item.sharedModes.includes(m) ? item.sharedModes.filter((x) => x !== m) : [...item.sharedModes, m];
    setItem({ ...item, sharedModes: next });
    try {
      await updateWishlistItem(item.id, { sharedModes: next });
    } catch {
      setItem(item);
      Alert.alert(t("catalog.saveFailedTitle"), t("catalog.saveFailed"));
    }
  };

  const toggleVisited = async () => {
    try {
      const updated = await markWishlistItemVisited(item.id, !item.visitedAt);
      if (updated) setItem(updated);
    } catch {
      Alert.alert(t("catalog.saveFailedTitle"), t("catalog.saveFailed"));
    }
  };

  const confirmDelete = () => {
    Alert.alert(t("wishlist.deleteTitle"), t("wishlist.deleteBody", { place: item.title }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => {
          void deleteWishlistItem(item.id)
            .then(() => router.back())
            .catch(() => Alert.alert(t("catalog.saveFailedTitle"), t("catalog.saveFailed")));
        },
      },
    ]);
  };

  const planVisit = () =>
    router.push(
      newPlanHref({
        title: item.title,
        location: where || item.title,
        imageUrl: item.imageUrl ?? null,
        placeId: item.placeId ?? null,
        wishlistId: item.id,
        source: "wishlist",
      })
    );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        onBack
        title={t("wishlist.title")}
        trailing={
          <Pressable
            onPress={() => router.push({ pathname: "/wishlist/edit", params: { id: item.id } })}
            accessibilityRole="button"
            accessibilityLabel={t("wishlist.edit")}
            hitSlop={8}
          >
            <Ionicons name="create-outline" size={22} color={theme.colors.textPrimary} />
          </Pressable>
        }
      />
      <Screen>
        <VenuePhoto
          source={{
            imageUrl: item.imageUrl,
            placeId: item.placeId,
            name: item.title,
            city: item.city,
            latitude: item.latitude,
            longitude: item.longitude,
          }}
          style={[styles.photo, { borderRadius: theme.radii.lg }]}
          icon="bookmark-outline"
          showAttribution
        />
        <Text style={[theme.type.h2, { color: theme.colors.textPrimary, fontFamily: theme.type.h2.fontFamily, marginTop: theme.spacing.lg }]}>
          {item.title}
        </Text>
        {item.visitedAt ? (
          <Text style={[theme.type.caption, { color: theme.colors.success, marginTop: theme.spacing.xs }]}>
            {t("wishlist.visitedOn", { date: formatAppDate(new Date(item.visitedAt), undefined, locale) })}
          </Text>
        ) : null}

        {where ? (
          <Pressable
            style={styles.row}
            onPress={() =>
              void Linking.openURL(
                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([item.title, where].join(", "))}`
              )
            }
            accessibilityRole="link"
            accessibilityLabel={t("catalog.openMapsA11y", { place: where })}
          >
            <Ionicons name="location-outline" size={18} color={theme.colors.primary} />
            <Text style={[theme.type.body, { color: theme.colors.primary, flex: 1 }]}>{where}</Text>
          </Pressable>
        ) : null}
        {item.price ? (
          <View style={styles.row}>
            <Ionicons name="cash-outline" size={18} color={theme.colors.textSecondary} />
            <Text style={[theme.type.body, { color: theme.colors.textSecondary }]}>{item.price}</Text>
          </View>
        ) : null}
        {link ? (
          <Pressable style={styles.row} onPress={() => void Linking.openURL(link)} accessibilityRole="link">
            <Ionicons name="link-outline" size={18} color={theme.colors.primary} />
            <Text style={[theme.type.body, { color: theme.colors.primary, flex: 1 }]} numberOfLines={1}>
              {t("wishlist.openSource")}
            </Text>
          </Pressable>
        ) : null}
        {item.description ? (
          <Text style={[theme.type.body, { color: theme.colors.textPrimary, marginTop: theme.spacing.md, lineHeight: 22 }]}>
            {item.description}
          </Text>
        ) : null}

        {shareable.length > 0 ? (
          <Card padding="md" style={{ marginTop: theme.spacing.xl }}>
            <Text style={[theme.type.bodyMedium, { color: theme.colors.textPrimary, marginBottom: theme.spacing.sm }]}>
              {t("wishlist.shareLabel")}
            </Text>
            <View style={styles.chips}>
              {shareable.map((m) => (
                <Chip
                  key={m}
                  label={t(SHARE_MODE_LABEL_KEYS[m])}
                  selected={item.sharedModes.includes(m)}
                  onPress={() => void toggleShare(m)}
                />
              ))}
            </View>
            <Text style={[theme.type.caption, { color: theme.colors.textMuted, marginTop: theme.spacing.sm }]}>
              {item.sharedModes.length ? t("wishlist.shareHintOn") : t("wishlist.shareHintOff")}
            </Text>
          </Card>
        ) : null}

        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.xl }}>
          <PrimaryButton title={t("wishlist.planVisit")} onPress={planVisit} />
          <SecondaryButton
            title={item.visitedAt ? t("wishlist.markNotVisited") : t("wishlist.markVisited")}
            onPress={() => void toggleVisited()}
          />
          <SecondaryButton title={t("common.delete")} onPress={confirmDelete} />
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { width: "100%", height: 220, marginTop: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
