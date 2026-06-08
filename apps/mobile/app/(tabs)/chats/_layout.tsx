import { Stack } from "expo-router";
import {
  TAB_HUB_SCREEN_NAMES,
  premiumHubStackScreenOptions,
  premiumPushStackScreenOptions,
} from "@/lib/navigation/screenOptions";

export default function ChatsLayout() {
  return (
    <Stack
      screenOptions={{
        ...premiumPushStackScreenOptions(),
        headerShown: true,
      }}
    >
      {TAB_HUB_SCREEN_NAMES.map((name) => (
        <Stack.Screen
          key={name}
          name={name}
          options={{
            ...premiumHubStackScreenOptions(),
            headerShown: false,
            ...(name === "filters" ? { title: "Chat filters" } : {}),
          }}
        />
      ))}
      <Stack.Screen name="new-chat" options={{ title: "New chat" }} />
      <Stack.Screen name="[conversationId]" options={{ title: "Chat" }} />
      <Stack.Screen name="conversation-info" options={{ title: "Group info" }} />
    </Stack>
  );
}
