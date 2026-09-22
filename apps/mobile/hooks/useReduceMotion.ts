// apps/mobile/hooks/useReduceMotion.ts
// Live OS "Reduce motion" setting. Seeds synchronously from Reanimated (read at startup) so the
// first frame is already correct, then follows AccessibilityInfo for changes while the app runs.

import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

export function useReduceMotion(): boolean {
  const initial = useReducedMotion();
  const [reduce, setReduce] = useState(initial);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (active) setReduce(v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  return reduce;
}
