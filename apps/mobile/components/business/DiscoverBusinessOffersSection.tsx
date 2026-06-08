import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useFocusEffect } from "expo-router";
import { Colors, Typography } from "@/constants/tokens";
import { listActiveBusinessOffers, type BusinessOfferRow } from "@/lib/business/offersStore";
import { BusinessOfferCard } from "@/components/business/BusinessOfferCard";

type Props = {
  source: "romance_discover" | "friends_discover";
  title?: string;
};

export function DiscoverBusinessOffersSection({
  source,
  title = "Partner offers near you",
}: Props) {
  const [offers, setOffers] = useState<BusinessOfferRow[]>([]);

  const load = useCallback(async () => {
    const rows = await listActiveBusinessOffers(12);
    setOffers(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (offers.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {offers.map((offer) => (
          <BusinessOfferCard key={offer.id} offer={offer} source={source} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 20, paddingHorizontal: 16 },
  title: {
    ...Typography.h3,
    color: Colors.business.primary,
    marginBottom: 10,
  },
  scroll: { paddingRight: 16 },
});
