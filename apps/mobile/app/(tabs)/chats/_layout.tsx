import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  TAB_HUB_SCREEN_NAMES,
  premiumHubStackScreenOptions,
  premiumPushStackScreenOptions,
} from "@/lib/navigation/screenOptions";

export default function ChatsLayout() {
  const { t } = useTranslation();
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
            ...(name === "filters" ? { title: t("chat.filters.title") } : {}),
          }}
        />
      ))}
      <Stack.Screen name="new-chat" options={{ title: t("chat.newChat") }} />
      <Stack.Screen name="[conversationId]" options={{ title: t("chat.title") }} />
      <Stack.Screen name="conversation-info" options={{ title: t("chat.groupInfo") }} />
    </Stack>
  );
}
