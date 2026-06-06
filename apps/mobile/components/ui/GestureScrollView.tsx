/**
 * ScrollView from react-native-gesture-handler — composes correctly with RNGH
 * (avoids jank when parent screens use pan/back gestures).
 */

import React, { type ComponentProps } from "react";
import { Platform } from "react-native";
import { ScrollView as GHScrollView } from "react-native-gesture-handler";

export type GestureScrollViewProps = ComponentProps<typeof GHScrollView>;

export const GestureScrollView = React.forwardRef<GHScrollView, GestureScrollViewProps>(
  function GestureScrollView(
    {
      keyboardShouldPersistTaps = "handled",
      showsVerticalScrollIndicator = false,
      removeClippedSubviews = Platform.OS === "android",
      ...props
    },
    ref
  ) {
    return (
      <GHScrollView
        ref={ref}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        removeClippedSubviews={removeClippedSubviews}
        {...props}
      />
    );
  }
);
