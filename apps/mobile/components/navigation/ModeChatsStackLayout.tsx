import { Stack } from "expo-router";
import {
  premiumHubStackScreenOptions,
  premiumPushStackScreenOptions,
} from "@/lib/navigation/screenOptions";

/** Nested stack under each mode's Chats tab (inbox → start → thread). */
export default function ModeChatsStackLayout() {
  return (
    <Stack screenOptions={premiumPushStackScreenOptions({ headerShown: false })}>
      <Stack.Screen name="index" options={premiumHubStackScreenOptions()} />
      <Stack.Screen name="start" options={{ title: "New conversation" }} />
      <Stack.Screen name="new-chat" options={{ title: "New chat" }} />
      <Stack.Screen name="[conversationId]" options={{ title: "Chat" }} />
      <Stack.Screen name="conversation-info" options={{ title: "Group info" }} />
      <Stack.Screen name="filters" options={{ title: "Chat filters" }} />
    </Stack>
  );
}
