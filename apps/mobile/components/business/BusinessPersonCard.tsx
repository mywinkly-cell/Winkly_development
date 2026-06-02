import React from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { Colors, Typography, Layout, Shadow } from "@/constants/tokens";
import type { BusinessPersonItem } from "@/lib/business/homeFeed";

type Props = {
  person: BusinessPersonItem;
  onPress: () => void;
  width?: number;
};

const CARD_WIDTH = 168;

export function BusinessPersonCard({ person, onPress, width = CARD_WIDTH }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width, opacity: pressed ? 0.92 : 1 },
        Shadow.card,
      ]}
    >
      {person.photoUrl ? (
        <Image source={{ uri: person.photoUrl }} style={styles.photo} />
      ) : (
        <View style={[styles.photo, styles.photoPlaceholder]}>
          <Text style={styles.initials}>{person.name.slice(0, 1).toUpperCase()}</Text>
        </View>
      )}
      <Text style={styles.name} numberOfLines={1}>
        {person.name}
      </Text>
      {person.subtitle ? (
        <Text style={styles.subtitle} numberOfLines={2}>
          {person.subtitle}
        </Text>
      ) : null}
      {person.meta ? (
        <Text style={styles.meta} numberOfLines={1}>
          {person.meta}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    padding: 12,
    marginRight: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  photo: {
    width: "100%",
    height: 120,
    borderRadius: Layout.radii.control,
    marginBottom: 10,
    backgroundColor: Colors.gray100,
  },
  photoPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    ...Typography.h2,
    color: Colors.business.primary,
  },
  name: {
    ...Typography.body,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.gray700,
    marginTop: 4,
  },
  meta: {
    ...Typography.caption,
    color: Colors.gray500,
    marginTop: 2,
  },
});
