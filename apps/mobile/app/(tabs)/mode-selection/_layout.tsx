import { Platform } from "react-native";
import { Stack } from "expo-router";

export default function ModeSelectionLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        animation: Platform.OS === "android" ? "slide_from_right" : "default",
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
