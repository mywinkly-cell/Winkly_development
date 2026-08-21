// apps/mobile/components/ui/WeeklySparksIcon.tsx
// Weekly Sparks icon: calendar with a spark inside. Kept visually distinct from
// SparklesIcon (Winkly AI concierge) so the two Planner entry points never read as the same action.

import React from "react";
import Svg, { Path, Rect } from "react-native-svg";

export function WeeklySparksIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2} y={5} width={14} height={15} rx={3.5} stroke={color} strokeWidth={1.8} />
      <Path d="M2 9.5h14" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M6 2.8v3.4M12 2.8v3.4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      {/* Spark on the calendar page — "this week's pick" */}
      <Path
        d="M9 11.2Q9 14.8 12.6 14.8Q9 14.8 9 18.4Q9 14.8 5.4 14.8Q9 14.8 9 11.2Z"
        fill={color}
      />
      {/* Small spark breaking out of the corner */}
      <Path
        d="M19.6 2.6Q19.6 5.6 22.6 5.6Q19.6 5.6 19.6 8.6Q19.6 5.6 16.6 5.6Q19.6 5.6 19.6 2.6Z"
        fill={color}
      />
    </Svg>
  );
}
