import { Stack } from "expo-router";
import {
  premiumHubStackScreenOptions,
  premiumPushStackScreenOptions,
} from "@/lib/navigation/screenOptions";

export default function PlannerLayout() {
  return (
    <Stack screenOptions={premiumPushStackScreenOptions({ headerShown: false })}>
      <Stack.Screen name="index" options={premiumHubStackScreenOptions()} />
    </Stack>
  );
}
