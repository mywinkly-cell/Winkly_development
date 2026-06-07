import React from "react";
import { useLocalSearchParams } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { Colors } from "@/constants/tokens";
import ChatView from "./chat-view";

export default function ChatDetail() {
  const {
    conversationId,
    partnerUserId,
    partnerName,
    partnerPhotoUrl,
    matchBridge,
  } = useLocalSearchParams<{
    conversationId?: string;
    partnerUserId?: string;
    partnerName?: string;
    partnerPhotoUrl?: string;
    matchBridge?: string;
  }>();

  if (!conversationId) {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator size="large" color={Colors.primaryViolet} />
      </View>
    );
  }

  return (
    <ChatView
      conversationId={conversationId}
      partnerUserId={typeof partnerUserId === "string" ? partnerUserId : undefined}
      partnerName={typeof partnerName === "string" ? partnerName : undefined}
      partnerPhotoUrl={typeof partnerPhotoUrl === "string" ? partnerPhotoUrl : undefined}
      matchBridge={matchBridge === "1" ? "1" : undefined}
    />
  );
}
