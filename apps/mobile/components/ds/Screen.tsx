// apps/mobile/components/ds/Screen.tsx
// Design-system primitive: the outer wrapper every screen should render.

import React from "react";
import { ScrollView, StyleSheet, View, type ScrollViewProps, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useAppTheme } from "@/constants/design-system";

type ScreenProps = {
  children: React.ReactNode;
  /** Wrap content in a ScrollView. Default true. */
  scroll?: boolean;
  /** Safe-area edges to inset. Default omits "top" (most screens render their own Header). */
  edges?: Edge[];
  /** Apply the default horizontal screen padding. Default true. */
  padded?: boolean;
  style?: ViewStyle;
  contentContainerStyle?: ScrollViewProps["contentContainerStyle"];
  /** Use the muted app background instead of the default surface background. */
  muted?: boolean;
};

const DEFAULT_EDGES: Edge[] = ["bottom", "left", "right"];

export function Screen({
  children,
  scroll = true,
  edges = DEFAULT_EDGES,
  padded = true,
  style,
  contentContainerStyle,
  muted = false,
}: ScreenProps) {
  const theme = useAppTheme();
  const backgroundColor = muted ? theme.colors.backgroundMuted : theme.colors.background;
  const paddingHorizontal = padded ? theme.spacing.xl : 0;

  if (!scroll) {
    return (
      <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor }, style]}>
        <View style={[styles.flex, { paddingHorizontal }, contentContainerStyle as ViewStyle]}>{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor }, style]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[{ paddingHorizontal, paddingBottom: theme.spacing.xxl }, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
