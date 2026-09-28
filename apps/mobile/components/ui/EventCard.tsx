/**
 * Events catalogue card (connected platforms, Winkly events, bookable activities).
 * Photo first — you should be able to decide from the card — then when, where, the lowest
 * price across booking sites, how many sites sell it and why it's shown to you.
 * Tapping opens the details screen (all photos + every booking option).
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { useFormatLocationDisplay } from "@/lib/location/useLocationDisplay";
import { formatAppDateTime, formatAppNumber, useAppLocaleTag } from "@/lib/i18n/appLocale";
import { VenuePhoto } from "@/components/ui/VenuePhoto";

export type EventPlatform = "ticketmaster" | "meetup" | "eventbrite" | "getyourguide" | "winkly";

/** One place to book / buy tickets (the same event can be sold on several platforms). */
export type EventOffer = {
  platform: EventPlatform;
  url: string;
  priceMin?: number | null;
  priceMax?: number | null;
  currency?: string | null;
  isFree?: boolean | null;
};

/** Why an item is shown to this user (translated on screen). */
export type EventMatchReason =
  | { type: "interest"; value: string }
  | { type: "distance"; km: number }
  | { type: "soon" };

export type EventCardItem = {
  id: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  /** All known pictures (merged across platforms). */
  images?: string[];
  startAt: string; // ISO
  endAt?: string | null;
  location?: string | null;
  venueName?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  hostName?: string | null;
  /** Cheapest booking link (kept for older callers); see `offers` for all of them. */
  externalUrl?: string | null;
  externalPlatform?: EventPlatform | null;
  /** Every platform this event can be booked on, cheapest first. */
  offers?: EventOffer[];
  /** "activity" = bookable on many days (tours, classes). */
  kind?: "event" | "activity";
  venueType?: string | null;
  match?: EventMatchReason[];
  category?: string | null;
  /** Winkly event id for navigation to event details */
  winklyEventId?: string | null;
};

type Props = {
  item: EventCardItem;
  /** "+ Plan": turn this idea into a plan (for yourself, a date, a meetup…). */
  onPlan?: (item: EventCardItem) => void;
  /** Save the venue to the wishlist. */
  onSaveVenue?: (item: EventCardItem) => void;
  onPress?: (item: EventCardItem) => void;
  /** Full-width list card (default) or a narrow strip card. */
  variant?: "wide" | "strip";
};

export const EVENT_PLATFORM_LABELS: Record<EventPlatform, string> = {
  ticketmaster: "Ticketmaster",
  meetup: "Meetup",
  eventbrite: "Eventbrite",
  getyourguide: "GetYourGuide",
  winkly: "Winkly",
};

/** "From €24" / "Free" / null, in the app locale. */
export function useOfferPriceLabel() {
  const { t } = useTranslation();
  const locale = useAppLocaleTag();
  return (offers: EventOffer[] | null | undefined): string | null => {
    let best: EventOffer | null = null;
    for (const o of offers ?? []) {
      if (o.isFree) return t("catalog.free");
      if (typeof o.priceMin === "number" && (!best || o.priceMin < (best.priceMin as number))) best = o;
    }
    if (!best || typeof best.priceMin !== "number") return null;
    const amount = best.currency
      ? formatAppNumber(best.priceMin, { style: "currency", currency: best.currency, maximumFractionDigits: 0 }, locale)
      : formatAppNumber(best.priceMin, { maximumFractionDigits: 0 }, locale);
    return t("catalog.priceFrom", { price: amount });
  };
}

/** One short line on why the item is shown ("You like jazz · 2 km away"). */
export function useMatchReasonLabel() {
  const { t } = useTranslation();
  const locale = useAppLocaleTag();
  return (match: EventMatchReason[] | null | undefined): string | null => {
    const parts = (match ?? []).map((m) =>
      m.type === "interest"
        ? t("catalog.reasonInterest", { interest: m.value })
        : m.type === "distance"
          ? t("catalog.reasonDistance", { km: formatAppNumber(m.km, { maximumFractionDigits: 1 }, locale) })
          : t("catalog.reasonSoon")
    );
    return parts.length ? parts.slice(0, 2).join(" · ") : null;
  };
}

export function EventCard({ item, onPlan, onSaveVenue, onPress, variant = "wide" }: Props) {
  const { t } = useTranslation();
  const locale = useAppLocaleTag();
  const fmtLoc = useFormatLocationDisplay();
  const priceLabel = useOfferPriceLabel()(item.offers);
  const reason = useMatchReasonLabel()(item.match);

  const loc = item.location ? fmtLoc(item.location) : "";
  const locationLine = [item.venueName, loc].filter(Boolean).join(" • ") || loc;
  const when =
    item.kind === "activity"
      ? t("catalog.anyDay")
      : formatAppDateTime(new Date(item.startAt), undefined, locale);
  const offerCount = item.offers?.length ?? 0;
  const platform = item.externalPlatform ?? (item.winklyEventId ? "winkly" : null);
  const wide = variant === "wide";

  return (
    <TouchableOpacity
      onPress={() => onPress?.(item)}
      activeOpacity={0.85}
      style={[styles.card, wide ? styles.cardWide : styles.cardStrip]}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <View style={[styles.imageWrap, wide && styles.imageWrapWide]}>
        <VenuePhoto
          source={{ imageUrl: item.imageUrl, name: item.imageUrl ? null : item.venueName, city: item.city }}
          style={StyleSheet.absoluteFill}
          icon="calendar-outline"
          width={wide ? 900 : 400}
        />
        {platform ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText} numberOfLines={1}>
              {offerCount > 1
                ? t("catalog.onPlatforms", { count: offerCount })
                : t("catalog.fromPlatform", { platform: EVENT_PLATFORM_LABELS[platform] })}
            </Text>
          </View>
        ) : null}
        {priceLabel ? (
          <View style={styles.priceBadge}>
            <Text style={styles.priceText}>{priceLabel}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.time}>{when}</Text>
        {locationLine ? <Text style={styles.location} numberOfLines={1}>{locationLine}</Text> : null}
        {reason ? (
          <View style={styles.reasonRow}>
            <Ionicons name="sparkles-outline" size={12} color={Colors.primaryViolet} />
            <Text style={styles.reason} numberOfLines={1}>{reason}</Text>
          </View>
        ) : null}
        {onPlan || onSaveVenue ? (
          <View style={styles.actions}>
            {onPlan ? (
              <TouchableOpacity
                onPress={() => onPlan(item)}
                style={styles.actionBtn}
                accessibilityRole="button"
                accessibilityLabel={t("catalog.planA11y", { title: item.title })}
                hitSlop={6}
              >
                <Ionicons name="add-circle-outline" size={18} color={Colors.primaryViolet} />
                <Text style={styles.actionText}>{t("catalog.plan")}</Text>
              </TouchableOpacity>
            ) : null}
            {onSaveVenue && (item.venueName || item.location) ? (
              <TouchableOpacity
                onPress={() => onSaveVenue(item)}
                style={styles.actionBtn}
                accessibilityRole="button"
                accessibilityLabel={t("catalog.saveVenueA11y", { venue: item.venueName ?? item.location ?? "" })}
                hitSlop={6}
              >
                <Ionicons name="heart-outline" size={18} color={Colors.primaryViolet} />
                <Text style={styles.actionText}>{t("catalog.saveVenue")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const CARD_WIDTH = 220;

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  cardWide: { width: "100%", marginBottom: 14 },
  cardStrip: { width: CARD_WIDTH, marginRight: 12 },
  imageWrap: { width: "100%", height: 110, position: "relative" },
  imageWrapWide: { height: 170 },
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    maxWidth: "70%",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: { fontSize: 11, color: Colors.white, fontWeight: "600" },
  priceBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: Colors.white,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  priceText: { fontSize: 12, color: Colors.textPrimary, fontWeight: "700" },
  body: { padding: 12 },
  title: { ...Typography.body, fontWeight: "700", color: Colors.textPrimary, marginBottom: 4 },
  time: { ...Typography.caption, color: Colors.gray600, marginBottom: 2 },
  location: { ...Typography.caption, color: Colors.gray500, marginBottom: 2 },
  reasonRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  reason: { ...Typography.caption, color: Colors.primaryViolet, flex: 1 },
  actions: { flexDirection: "row", gap: 18, marginTop: 10 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "700" },
});

export const EVENT_CARD_WIDTH = CARD_WIDTH;
