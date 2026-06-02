// Winkly Events Mode – Chats Screen

import React from "react";
import { View } from "react-native";
import { ChatsHeader } from "@/components/layout/ChatsHeader";
import { EventsBottomNav } from "@/components/layout/EventsBottomNav";
import { ChatsInboxContent } from "@/components/chats/ChatsInboxContent";
import { Colors } from "@/constants/tokens";
import { useModeContext } from "@/providers";

export default function EventsChats() {
  const { context: modeContext } = useModeContext();
  return (
    <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
      <ChatsHeader mode={modeContext.active_mode ?? undefined} />
      <ChatsInboxContent sourceMode="events" />
      <EventsBottomNav />
    </View>
  );
}
