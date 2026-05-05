// ────────────────────────────────────────────────
// Winkly Romance Mode – Chats Screen
// Stays within Romance: ModeHeader + ChatsInboxContent + RomanceBottomNav
// Romance tab is first and active by default
// ────────────────────────────────────────────────

import React from "react";
import { View } from "react-native";
import { ModeHeader } from "@/components/layout/ModeHeader";
import { RomanceBottomNav } from "@/components/layout/RomanceBottomNav";
import { ChatsInboxContent } from "@/components/chats/ChatsInboxContent";
import { Colors } from "@/constants/tokens";

export default function RomanceChats() {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
      <ModeHeader currentMode="romance" rightSlot="filterSettings" />
      <ChatsInboxContent sourceMode="romance" />
      <RomanceBottomNav />
    </View>
  );
}
