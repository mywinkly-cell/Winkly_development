// apps/mobile/components/ui/Avatar.tsx
// Token-based Avatar (spec v8.1)

import React from "react";
import { View, Image, Text, StyleSheet } from "react-native";
import { Colors, Typography } from "@/constants/tokens";

type AvatarProps = {
  uri?: string | null;
  initials?: string;
  size?: number;
};

export function Avatar({ uri, initials, size = 48 }: AvatarProps) {
  const style = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return <Image source={{ uri }} style={[styles.img, style]} resizeMode="cover" />;
  }

  const letter = initials?.slice(0, 2).toUpperCase() ?? "?";
  return (
    <View style={[styles.placeholder, style]}>
      <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  img: {
    overflow: "hidden",
  },
  placeholder: {
    backgroundColor: Colors.gray200,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    ...Typography.button,
    color: Colors.gray600,
  },
});
