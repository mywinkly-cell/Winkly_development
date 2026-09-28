// apps/mobile/components/ui/SponsoredOfferCard.tsx
// A paid venue placement in the Events catalogue — always clearly labelled "Sponsored".
// Venues don't need a business account: offers are managed by the Winkly team
// (sponsored_venue_offers). Impressions and taps are recorded for the venue's report.

import React, { useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { VenuePhoto } from "@/components/ui/VenuePhoto";
import { recordSponsoredEvent, type SponsoredOffer } from "@/lib/events/catalog";

type Props = {
  offer: SponsoredOffer;
  onPlan?: (offer: SponsoredOffer) => void;
  onSave?: (offer: SponsoredOffer) => void;
};

const CTA_KEYS: Record<SponsoredOffer["ctaKind"], string> = {
  visit: "catalog.sponsoredVisit",
  book: "catalog.sponsoredBook",
  menu: "catalog.sponsoredMenu",
  offer: "catalog.sponsoredOffer",
};

export function SponsoredOfferCard({ offer, onPlan, onSave }: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    recordSponsoredEvent(offer.id, "impression");
  }, [offer.id]);

  const openLink = () => {
    if (!offer.linkUrl) return;
    recordSponsoredEvent(offer.id, "tap");
    void Linking.openURL(offer.linkUrl);
  };

  return (
    <View style={styles.card}>
      <View style={styles.imageWrap}>
        <VenuePhoto
          source={{ imageUrl: offer.imageUrl, placeId: offer.placeId, name: offer.venueName, city: offer.city }}
          style={StyleSheet.absoluteFill}
          icon="storefront-outline"
          width={900}
        />
        <View style={styles.sponsoredBadge}>
          <Text style={styles.sponsoredText}>{t("catalog.sponsored")}</Text>
        </View>
        {offer.priceLabel ? (
          <View style={styles.priceBadge}>
            <Text style={styles.priceText} numberOfLines={1}>{offer.priceLabel}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text style={styles.venue} numberOfLines={1}>{offer.venueName}</Text>
        <Text style={styles.title} numberOfLines={2}>{offer.title}</Text>
        {offer.description ? <Text style={styles.desc} numberOfLines={2}>{offer.description}</Text> : null}
        {offer.address ? <Text style={styles.address} numberOfLines={1}>{offer.address}</Text> : null}
        <View style={styles.actions}>
          {offer.linkUrl ? (
            <TouchableOpacity onPress={openLink} style={styles.cta} accessibilityRole="link">
              <Text style={styles.ctaText}>{t(CTA_KEYS[offer.ctaKind])}</Text>
            </TouchableOpacity>
          ) : null}
          {onPlan ? (
            <TouchableOpacity
              onPress={() => {
                recordSponsoredEvent(offer.id, "plan");
                onPlan(offer);
              }}
              style={styles.actionBtn}
              accessibilityRole="button"
              accessibilityLabel={t("catalog.planA11y", { title: offer.venueName })}
              hitSlop={6}
            >
              <Ionicons name="add-circle-outline" size={18} color={Colors.primaryViolet} />
              <Text style={styles.actionText}>{t("catalog.plan")}</Text>
            </TouchableOpacity>
          ) : null}
          {onSave ? (
            <TouchableOpacity
              onPress={() => {
                recordSponsoredEvent(offer.id, "save");
                onSave(offer);
              }}
              style={styles.actionBtn}
              accessibilityRole="button"
              accessibilityLabel={t("catalog.saveVenueA11y", { venue: offer.venueName })}
              hitSlop={6}
            >
              <Ionicons name="heart-outline" size={18} color={Colors.primaryViolet} />
              <Text style={styles.actionText}>{t("catalog.saveVenue")}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    marginBottom: 14,
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  imageWrap: { width: "100%", height: 150, position: "relative" },
  sponsoredBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: Colors.white,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  sponsoredText: { fontSize: 11, color: Colors.gray600, fontWeight: "700" },
  priceBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    maxWidth: "55%",
    backgroundColor: Colors.primaryViolet,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  priceText: { fontSize: 12, color: Colors.white, fontWeight: "700" },
  body: { padding: 12 },
  venue: { ...Typography.caption, color: Colors.gray600, fontWeight: "700", marginBottom: 2 },
  title: { ...Typography.body, fontWeight: "700", color: Colors.textPrimary, marginBottom: 4 },
  desc: { ...Typography.caption, color: Colors.gray600, marginBottom: 4 },
  address: { ...Typography.caption, color: Colors.gray500 },
  actions: { flexDirection: "row", alignItems: "center", gap: 18, marginTop: 10, flexWrap: "wrap" },
  cta: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  ctaText: { ...Typography.caption, color: Colors.white, fontWeight: "700" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "700" },
});
