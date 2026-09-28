// Winkly Events – catalogue item details
// Everything needed to decide without leaving the app: photos, when/where, why it's shown
// to you, and — like hotel booking sites in Google Maps — every platform where it can be
// booked, with the price on each. "+ Plan it" turns it into a plan (just me, a date, a
// meetup…); "Save place" keeps the venue in the wishlist for later.

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Linking,
  Share,
  Alert,
  useWindowDimensions,
  StyleSheet,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Header, Card, PrimaryButton, SecondaryButton } from "@/components/ds";
import { useAppTheme } from "@/constants/design-system";
import { VenuePhoto } from "@/components/ui/VenuePhoto";
import { EVENT_PLATFORM_LABELS, useMatchReasonLabel, useOfferPriceLabel } from "@/components/ui/EventCard";
import { getCachedCatalogItem } from "@/lib/events/catalog";
import { newPlanHref } from "@/lib/planner/newPlan";
import { saveVenueToWishlist } from "@/lib/wishlistStore";
import { formatAppDateTime, formatAppTime, useAppLocaleTag } from "@/lib/i18n/appLocale";
import { useFormatLocationDisplay } from "@/lib/location/useLocationDisplay";

const GALLERY_HEIGHT = 240;

export default function CatalogItemScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { t } = useTranslation();
  const locale = useAppLocaleTag();
  const fmtLoc = useFormatLocationDisplay();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ id?: string }>();
  const item = useMemo(() => (params.id ? getCachedCatalogItem(String(params.id)) : null), [params.id]);
  const priceLabel = useOfferPriceLabel();
  const reason = useMatchReasonLabel()(item?.match);
  const [page, setPage] = useState(0);

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <Header onBack title={t("catalog.detailsTitle")} />
        <View style={{ padding: theme.spacing.xl }}>
          <Text style={[theme.type.body, { color: theme.colors.textSecondary }]}>{t("catalog.itemGone")}</Text>
        </View>
      </View>
    );
  }

  const images = item.images?.length ? item.images : item.imageUrl ? [item.imageUrl] : [];
  const venueLine = [item.venueName, item.location ? fmtLoc(item.location) : null].filter(Boolean).join(" · ");
  const start = new Date(item.startAt);
  const end = item.endAt ? new Date(item.endAt) : null;
  const when =
    item.kind === "activity"
      ? t("catalog.anyDay")
      : end
        ? t("catalog.whenRange", { start: formatAppDateTime(start, undefined, locale), end: formatAppTime(end, undefined, locale) })
        : formatAppDateTime(start, undefined, locale);
  const mapsQuery = [item.venueName, item.location].filter(Boolean).join(", ");
  const offers = item.offers ?? [];

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)));
  };

  const plan = () => {
    Haptics.selectionAsync();
    router.push(
      newPlanHref({
        title: item.title,
        startsAt: item.kind === "activity" ? null : item.startAt,
        endsAt: item.kind === "activity" ? null : item.endAt ?? null,
        location: mapsQuery,
        imageUrl: item.imageUrl ?? null,
        catalogId: item.id,
        source: "catalog",
      })
    );
  };

  const saveVenue = async () => {
    const title = item.venueName ?? item.location ?? item.title;
    try {
      const { alreadySaved } = await saveVenueToWishlist({
        title,
        mode: "events",
        address: item.location ?? undefined,
        city: item.city ?? undefined,
        latitude: item.latitude ?? undefined,
        longitude: item.longitude ?? undefined,
        sourceUrl: item.externalUrl ?? undefined,
        savedFrom: "venue_card",
      });
      Alert.alert(
        alreadySaved ? t("catalog.alreadySavedTitle") : t("catalog.savedTitle"),
        t("catalog.savedBody", { place: title })
      );
    } catch {
      Alert.alert(t("catalog.saveFailedTitle"), t("catalog.saveFailed"));
    }
  };

  const share = () => {
    const url = offers[0]?.url ?? item.externalUrl ?? "";
    void Share.share({ message: [item.title, when, venueLine, url].filter(Boolean).join("\n") });
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        onBack
        title={t("catalog.detailsTitle")}
        trailing={
          <Pressable onPress={share} accessibilityRole="button" accessibilityLabel={t("catalog.shareA11y")} hitSlop={8}>
            <Ionicons name="share-outline" size={22} color={theme.colors.textPrimary} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        <View style={{ height: GALLERY_HEIGHT }}>
          {images.length > 0 ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={32}>
              {images.map((uri, i) => (
                <VenuePhoto
                  key={`${uri}-${i}`}
                  source={{ imageUrl: uri }}
                  style={{ width, height: GALLERY_HEIGHT }}
                  accessibilityLabel={t("catalog.photoA11y", { index: i + 1, count: images.length })}
                />
              ))}
            </ScrollView>
          ) : (
            <VenuePhoto
              source={{ name: item.venueName, city: item.city, latitude: item.latitude, longitude: item.longitude }}
              style={{ width, height: GALLERY_HEIGHT }}
              icon="calendar-outline"
              showAttribution
            />
          )}
          {images.length > 1 ? (
            <View style={styles.dots}>
              {images.map((_, i) => (
                <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
              ))}
            </View>
          ) : null}
        </View>

        <View style={{ padding: theme.spacing.xl }}>
          <Text style={[theme.type.h2, { color: theme.colors.textPrimary, fontFamily: theme.type.h2.fontFamily }]}>
            {item.title}
          </Text>
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={[theme.type.body, { color: theme.colors.textSecondary, flex: 1 }]}>{when}</Text>
          </View>
          {venueLine ? (
            <Pressable
              style={styles.metaRow}
              onPress={() =>
                void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`)
              }
              accessibilityRole="link"
              accessibilityLabel={t("catalog.openMapsA11y", { place: venueLine })}
            >
              <Ionicons name="location-outline" size={16} color={theme.colors.primary} />
              <Text style={[theme.type.body, { color: theme.colors.primary, flex: 1 }]}>{venueLine}</Text>
            </Pressable>
          ) : null}
          {item.hostName ? (
            <View style={styles.metaRow}>
              <Ionicons name="person-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={[theme.type.body, { color: theme.colors.textSecondary, flex: 1 }]}>{item.hostName}</Text>
            </View>
          ) : null}
          {reason ? (
            <View style={[styles.reasonBox, { backgroundColor: theme.colors.backgroundMuted, borderRadius: theme.radii.md }]}>
              <Ionicons name="sparkles-outline" size={16} color={theme.colors.primary} />
              <Text style={[theme.type.body, { color: theme.colors.textPrimary, flex: 1 }]}>
                {t("catalog.whyForYou", { reason })}
              </Text>
            </View>
          ) : null}

          {item.description ? (
            <Text style={[theme.type.body, { color: theme.colors.textPrimary, marginTop: theme.spacing.lg, lineHeight: 22 }]}>
              {item.description}
            </Text>
          ) : null}

          {offers.length > 0 ? (
            <Card padding="md" style={{ marginTop: theme.spacing.xl }}>
              <Text style={[theme.type.h3, { color: theme.colors.textPrimary, marginBottom: theme.spacing.sm }]}>
                {t("catalog.whereToBook", { count: offers.length })}
              </Text>
              {offers.map((o, i) => (
                <Pressable
                  key={o.platform}
                  onPress={() => void Linking.openURL(o.url)}
                  accessibilityRole="link"
                  accessibilityLabel={t("catalog.bookOnA11y", { platform: EVENT_PLATFORM_LABELS[o.platform] })}
                  style={[
                    styles.offerRow,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[theme.type.bodyMedium, { color: theme.colors.textPrimary }]}>
                      {EVENT_PLATFORM_LABELS[o.platform]}
                    </Text>
                    {i === 0 && offers.length > 1 && (o.isFree || typeof o.priceMin === "number") ? (
                      <Text style={[theme.type.caption, { color: theme.colors.success }]}>{t("catalog.bestPrice")}</Text>
                    ) : null}
                  </View>
                  <Text style={[theme.type.bodyMedium, { color: theme.colors.textPrimary }]}>
                    {priceLabel([o]) ?? t("catalog.seePrices")}
                  </Text>
                  <View style={[styles.bookPill, { backgroundColor: theme.colors.primary }]}>
                    <Text style={[theme.type.caption, { color: theme.colors.onPrimary, fontWeight: "700" }]}>
                      {o.isFree ? t("catalog.register") : t("catalog.book")}
                    </Text>
                  </View>
                </Pressable>
              ))}
              <Text style={[theme.type.caption, { color: theme.colors.textMuted, marginTop: theme.spacing.sm }]}>
                {t("catalog.bookingNote")}
              </Text>
            </Card>
          ) : null}

          <View style={{ marginTop: theme.spacing.xl, gap: theme.spacing.sm }}>
            <PrimaryButton title={t("catalog.planIt")} onPress={plan} />
            {item.venueName || item.location ? (
              <SecondaryButton title={t("catalog.saveVenue")} onPress={() => void saveVenue()} />
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { position: "absolute", bottom: 10, alignSelf: "center", flexDirection: "row", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.5)" },
  dotActive: { backgroundColor: "#FFFFFF" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  reasonBox: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, padding: 12 },
  offerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  bookPill: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
});
