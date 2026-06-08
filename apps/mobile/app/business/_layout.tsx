import { Stack } from "expo-router";
import { premiumPushStackScreenOptions } from "@/lib/navigation/screenOptions";

export default function BusinessLayout() {
  return <Stack screenOptions={premiumPushStackScreenOptions({ headerShown: false })} />;
}
