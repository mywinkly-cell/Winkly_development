import { Stack } from "expo-router";
import {
  premiumHubStackScreenOptions,
  premiumPushStackScreenOptions,
} from "@/lib/navigation/screenOptions";

/** Nested stack under each mode's Planner tab. */
export default function ModePlannerStackLayout() {
  return (
    <Stack screenOptions={premiumPushStackScreenOptions({ headerShown: false })}>
      <Stack.Screen name="index" options={premiumHubStackScreenOptions()} />
      <Stack.Screen name="invitations" options={{ title: "Invitations" }} />
      <Stack.Screen name="settings" options={{ title: "Planner settings" }} />
      <Stack.Screen name="filters" options={{ title: "Planner filters" }} />
    </Stack>
  );
}
