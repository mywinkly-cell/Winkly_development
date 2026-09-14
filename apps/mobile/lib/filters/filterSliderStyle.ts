import { Platform, TextStyle, ViewStyle } from "react-native";
import { spacing, radii, type AppTheme } from "@/constants/design-system";

/**
 * Shared knob/track sizing for filter distance + age range sliders.
 * The single-knob Slider (distance) hardcodes its track height to
 * `knobSize / 3` with no override prop, while the two-knob RangeSlider
 * (age) takes an explicit `barHeight`. Keeping KNOB_SIZE divisible by 3
 * lets FILTER_SLIDER_BAR_HEIGHT equal `KNOB_SIZE / 3` exactly, so both
 * sliders render the identical track height instead of an off-by-a-third-pixel mismatch.
 */
export const FILTER_SLIDER_KNOB_SIZE = 21;
export const FILTER_SLIDER_BAR_HEIGHT = FILTER_SLIDER_KNOB_SIZE / 3;

export const FILTER_SLIDER_CONTAINER_STYLE: ViewStyle = {
  height: Platform.OS === "ios" ? 36 : 44,
  padding: 0,
};

export const FILTER_SLIDER_WRAP_STYLE: ViewStyle = {
  width: "100%",
  height: Platform.OS === "ios" ? 36 : 44,
};

/** Vertical gap above a slider field that follows another field (e.g. "Age range" below "Distance"). */
export const FILTER_SLIDER_FIELD_GAP = spacing.xl;

/** Row holding the field label and its current-value pill, directly above the slider. */
export const FILTER_SLIDER_VALUE_ROW_STYLE: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: spacing.sm,
};

/** Current-value pill shown at the end of FILTER_SLIDER_VALUE_ROW_STYLE. Theme-dependent — call with the active theme. */
export function filterSliderValuePillStyle(theme: AppTheme): ViewStyle {
  return {
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: theme.colors.backgroundMuted,
  };
}

export function filterSliderValueTextStyle(theme: AppTheme): TextStyle {
  return {
    ...theme.type.body,
    fontFamily: theme.type.body.fontFamily,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  };
}
