// ────────────────────────────────────────────────
// Winkly Business Mode – Chats Screen
// Stays within Business: ModeHeader + ChatsInboxContent + ModeBottomBar
// Business tab is first and active by default
// ────────────────────────────────────────────────

import React from "react";
import { View } from "react-native";
import { ChatsHeader } from "@/components/layout/ChatsHeader";
import { ModeBottomBar } from "@/components/layout/ModeBottomBar";
import { ChatsInboxContent } from "@/components/chats/ChatsInboxContent";
import { Colors } from "@/constants/tokens";

export default function BusinessChats() {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
      <ChatsHeader />
      <ChatsInboxContent sourceMode="business" />
      <ModeBottomBar mode="business" />
    </View>
  );
}
