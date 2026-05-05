// ScreenTopSpacer — ~0.79× device top panel for gap below status bar / notch

import React from "react";
import { View } from "react-native";
import { useScreenTopPadding } from "@/lib/useScreenTopPadding";
import { Colors } from "@/constants/tokens";

/** Renders top padding equal to ~0.79× the device's top panel (status bar area). */
export function ScreenTopSpacer() {
  const height = useScreenTopPadding();
  return (
    <View
      style={{
        height,
        width: "100%",
        backgroundColor: Colors.backgroundMuted,
      }}
    />
  );
}
