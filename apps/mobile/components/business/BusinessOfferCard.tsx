import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Linking,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Colors, Typography, Layout } from "@/constants/tokens";
import type { BusinessOfferRow } from "@/lib/business/offersStore";
import { recordBusinessAnalyticsEvent } from "@/lib/business/analyticsStore";

type Props = {
  offer: BusinessOfferRow;
  source: string;
  onAddToPlanner?: (offer: BusinessOfferRow) => void;
};

export function BusinessOfferCard({ offer, source, onAddToPlanner }: Props) {
  const loggedImpression = useRef(false);

  useEffect(() => {
    if (loggedImpression.current) return;
    loggedImpression.current = true;
    void recordBusinessAnalyticsEvent({
      businessId: offer.business_id,
      eventType: "offer_impression",
      metadata: { offer_id: offer.id, source },
    });
  }, [offer.business_id, offer.id, source]);

  const onTap = async () => {
    Haptics.selectionAsync();
    void recordBusinessAnalyticsEvent({
      businessId: offer.business_id,
      eventType: "offer_tap",
      metadata: { offer_id: offer.id, source },
    });
    if (offer.booking_url) {
      await Linking.openURL(offer.booking_url);
    }
  };

  const onPlanner = () => {
    Haptics.selectionAsync();
    void recordBusinessAnalyticsEvent({
      businessId: offer.business_id,
      eventType: "add_to_planner",
      metadata: { offer_id: offer.id, source },
    });
    onAddToPlanner?.(offer);
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={onTap} activeOpacity={0.9}>
        {offer.image_url ? (
          <Image source={{ uri: offer.image_url }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text style={styles.placeholderEmoji}>✨</Text>
          </View>
        )}
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>
            {offer.title}
          </Text>
          {offer.description ? (
            <Text style={styles.description} numberOfLines={2}>
              {offer.description}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
      {onAddToPlanner ? (
        <TouchableOpacity style={styles.plannerBtn} onPress={onPlanner} activeOpacity={0.85}>
          <Text style={styles.plannerBtnText}>Add to planner</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 220,
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    overflow: "hidden",
    marginRight: 12,
  },
  image: {
    width: "100%",
    height: 110,
    backgroundColor: Colors.gray100,
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderEmoji: { fontSize: 28 },
  body: { padding: 12 },
  title: { ...Typography.body, fontWeight: "600", color: Colors.textPrimary },
  description: { ...Typography.caption, color: Colors.gray600, marginTop: 4 },
  plannerBtn: {
    marginHorizontal: 12,
    marginBottom: 12,
    backgroundColor: Colors.business.primary + "18",
    borderRadius: Layout.radii.control,
    paddingVertical: 8,
    alignItems: "center",
  },
  plannerBtnText: { ...Typography.caption, color: Colors.business.primary, fontWeight: "600" },
});
