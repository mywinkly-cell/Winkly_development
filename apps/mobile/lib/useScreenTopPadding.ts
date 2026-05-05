// useScreenTopPadding — returns ~0.79× device top panel (status bar / notch) for consistent top spacing

import { useSafeAreaInsets } from "@/lib/useSafeAreaInsets";

/** Top padding = 0.7875 × device top panel (0.75 + 5%) for gap below system bar. */
export function useScreenTopPadding(): number {
  const insets = useSafeAreaInsets();
  return Math.round(insets.top * 0.7875);
}
