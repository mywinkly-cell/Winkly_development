import { Stack } from "expo-router";

export default function ChatsLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="new-chat" options={{ title: "New chat" }} />
      <Stack.Screen name="[conversationId]" options={{ title: "Chat" }} />
    </Stack>
  );
}
