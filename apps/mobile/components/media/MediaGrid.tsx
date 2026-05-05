// apps/mobile/components/media/MediaGrid.tsx
// Simple media grid (photos/videos).

import React from "react";
import { Image, Pressable, StyleSheet, View, ViewStyle } from "react-native";
import { Colors, Layout } from "@/constants/tokens";

export type MediaItem = {
  id: string;
  uri: string;
  type?: "image" | "video";
};

export type MediaGridProps = {
  items: MediaItem[];
  columns?: number;
  gap?: number;
  style?: ViewStyle;
  onPressItem?: (item: MediaItem, index: number) => void;
};

export function MediaGrid({ items, columns = 3, gap = 10, style, onPressItem }: MediaGridProps) {
  const col = Math.max(1, Math.min(5, columns));
  const widthPct = `${100 / col}%` as const;

  return (
    <View style={[styles.wrap, { marginHorizontal: -gap / 2 }, style]}>
      {items.map((it, idx) => (
        <View key={it.id} style={{ width: widthPct, padding: gap / 2 }}>
          <Pressable
            onPress={onPressItem ? () => onPressItem(it, idx) : undefined}
            style={styles.tile}
            accessibilityRole={onPressItem ? "button" : undefined}
          >
            <Image source={{ uri: it.uri }} style={styles.img} resizeMode="cover" />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  tile: {
    aspectRatio: 1,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  img: { width: "100%", height: "100%" },
});

