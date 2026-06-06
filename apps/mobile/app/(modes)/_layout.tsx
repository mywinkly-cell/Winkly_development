// Parent navigator for the four mode sub-apps (Identity Firewall).
// Cross-mode switches use a short fade (not a horizontal push).

import React from "react";
import { Stack } from "expo-router";
import { ModeLocationGate } from "@/components/location/ModeLocationGate";
import { premiumContextStackScreenOptions } from "@/lib/navigation/screenOptions";

const MODE_NAMES = ["romance", "friends", "business", "events"] as const;

export default function ModesLayout() {
  return (
    <>
      <ModeLocationGate />
      <Stack screenOptions={premiumContextStackScreenOptions({ headerShown: false })}>
        {MODE_NAMES.map((name) => (
          <Stack.Screen key={name} name={name} options={premiumContextStackScreenOptions()} />
        ))}
      </Stack>
    </>
  );
}
