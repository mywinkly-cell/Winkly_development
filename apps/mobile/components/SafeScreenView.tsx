// SafeScreenView — Safe area without top (top = ~0.79× device panel via Stack header)

import React from "react";
import { type Edge, SafeAreaView, type SafeAreaViewProps } from "react-native-safe-area-context";

const DEFAULT_EDGES: Edge[] = ["bottom", "left", "right"];

/** Use instead of SafeAreaView when Stack header provides ~0.79× top spacing. */
export function SafeScreenView(props: SafeAreaViewProps) {
  const { edges = DEFAULT_EDGES, ...rest } = props;
  return <SafeAreaView edges={edges} {...rest} />;
}
