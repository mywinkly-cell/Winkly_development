import { Stack } from "expo-router";

export default function ModeSelectionLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="chats" />
      <Stack.Screen name="planner" />
    </Stack>
  );
}
