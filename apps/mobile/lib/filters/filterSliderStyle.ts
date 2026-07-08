import { Platform, ViewStyle } from "react-native";

/** Shared knob/track sizing for filter distance + age range sliders. */
export const FILTER_SLIDER_KNOB_SIZE = 20;
/** Matches single-knob slider track height (knobSize / 3). */
export const FILTER_SLIDER_BAR_HEIGHT = 7;

export const FILTER_SLIDER_CONTAINER_STYLE: ViewStyle = {
  height: Platform.OS === "ios" ? 36 : 44,
  padding: 0,
};

export const FILTER_SLIDER_WRAP_STYLE: ViewStyle = {
  width: "100%",
  height: Platform.OS === "ios" ? 36 : 44,
};
