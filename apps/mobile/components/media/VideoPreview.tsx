// apps/mobile/components/media/VideoPreview.tsx
// Minimal video preview (placeholder until we add expo-video).

import React from "react";
import { View, Text, StyleSheet, ViewStyle, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";

export type VideoPreviewProps = {
  uri: string;
  style?: ViewStyle;
  onPress?: () => void;
};

export function VideoPreview({ uri, style, onPress }: VideoPreviewProps) {
  const Container: React.ElementType = onPress ? Pressable : View;
  const props = onPress ? { onPress, style: [styles.box, style] } : { style: [styles.box, style] };

  return (
    <Container {...(props as any)} accessibilityRole={onPress ? "button" : undefined}>
      <Ionicons name="play-circle" size={44} color={Colors.white} />
      <Text style={styles.text} numberOfLines={1}>
        {uri}
      </Text>
    </Container>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: Colors.softBlack,
    borderRadius: Layout.radii.card,
    padding: Layout.spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  text: { ...Typography.caption, color: Colors.gray200 },
});

