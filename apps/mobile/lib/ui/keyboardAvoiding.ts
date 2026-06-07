import { Platform } from "react-native";
import type { KeyboardAvoidingViewProps } from "react-native";

/** Custom onboarding / profile headers (back row + title). */
export const PROFILE_HEADER_KEYBOARD_OFFSET = 68;

export function keyboardAvoidingProps(
  headerOffset = 0
): Pick<KeyboardAvoidingViewProps, "behavior" | "keyboardVerticalOffset"> {
  return {
    behavior: Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined,
    keyboardVerticalOffset: Platform.OS === "ios" ? headerOffset : 0,
  };
}
