import React from "react";
import { View } from "react-native";
import { ChatsHeader } from "@/components/layout/ChatsHeader";
import { BusinessBottomNav } from "@/components/layout/BusinessBottomNav";
import { ChatsInboxContent } from "@/components/chats/ChatsInboxContent";
import { Colors } from "@/constants/tokens";
import { useModeContext } from "@/providers";

export default function BusinessChats() {
  const { context: modeContext } = useModeContext();
  return (
    <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
      <ChatsHeader mode={modeContext.active_mode ?? "business"} />
      <ChatsInboxContent sourceMode="business" />
      <BusinessBottomNav />
    </View>
  );
}
