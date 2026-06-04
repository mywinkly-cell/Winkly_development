// Legacy route alias: /chats/:id → /chats/[conversationId]

import { Redirect, useLocalSearchParams } from "expo-router";

export default function ChatIdAlias() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  if (!id || typeof id !== "string") {
    return <Redirect href="/chats" />;
  }
  return <Redirect href={{ pathname: "/chats/[conversationId]", params: { conversationId: id } }} />;
}
