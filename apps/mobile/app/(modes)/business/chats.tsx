// ────────────────────────────────────────────────
// Winkly Business Mode – Chats Screen
// Stays within Business: ModeHeader + ChatsInboxContent + ModeBottomBar
// Business tab is first and active by default
// ────────────────────────────────────────────────

import React from "react";
import { View } from "react-native";
import { ModeHeader } from "@/components/layout/ModeHeader";
import { ModeBottomBar } from "@/components/layout/ModeBottomBar";
import { ChatsInboxContent } from "@/components/chats/ChatsInboxContent";
import { Colors } from "@/constants/tokens";

export default function BusinessChats() {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
      <ModeHeader currentMode="business" rightSlot="filterSettings" />
      <ChatsInboxContent sourceMode="business" />
      <ModeBottomBar mode="business" />
    </View>
  );
}
