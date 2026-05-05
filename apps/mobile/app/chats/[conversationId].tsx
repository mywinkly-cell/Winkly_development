import React from "react";
import { useLocalSearchParams } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import ChatView from "./chat-view";

export default function ChatDetail() {
  const { conversationId } = useLocalSearchParams<{ conversationId?: string }>();

  if (!conversationId) {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <ChatView conversationId={conversationId} />;
}
