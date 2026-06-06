import { Stack } from "expo-router";
import { premiumHubStackScreenOptions } from "@/lib/navigation/screenOptions";

export default function ModeSelectionLayout() {
  return (
    <Stack screenOptions={premiumHubStackScreenOptions({ headerShown: false, gestureEnabled: true })}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
