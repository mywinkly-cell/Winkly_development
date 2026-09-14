// apps/mobile/components/ds/Card.tsx
// Design-system primitive: elevated surface container.

import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useAppTheme } from "@/constants/design-system";

type CardProps = {
  children: React.ReactNode;
  /** Elevation level. 0 = flat (border only, no shadow). Default 1. */
  elevation?: 0 | 1 | 2 | 3;
  /** Padding scale token. Default "lg". */
  padding?: "none" | "sm" | "md" | "lg" | "xl";
  style?: StyleProp<ViewStyle>;
};

const PADDING_KEY = { none: "none", sm: "sm", md: "md", lg: "lg", xl: "xl" } as const;

export function Card({ children, elevation = 1, padding = "lg", style }: CardProps) {
  const theme = useAppTheme();
  const isDark = theme.scheme === "dark";

  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.lg,
          padding: theme.spacing[PADDING_KEY[padding]],
          borderWidth: isDark || elevation === 0 ? 1 : 0,
          borderColor: theme.colors.border,
        },
        elevation > 0 ? theme.elevation(elevation as 1 | 2 | 3) : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}
