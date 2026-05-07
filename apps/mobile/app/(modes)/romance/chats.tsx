// ────────────────────────────────────────────────
// Winkly Romance Mode – Chats Screen
// Stays within Romance: ModeHeader + ChatsInboxContent + RomanceBottomNav
// Romance tab is first and active by default
// ────────────────────────────────────────────────

import React from "react";
import { View } from "react-native";
import { ChatsHeader } from "@/components/layout/ChatsHeader";
import { RomanceBottomNav } from "@/components/layout/RomanceBottomNav";
import { ChatsInboxContent } from "@/components/chats/ChatsInboxContent";
import { Colors } from "@/constants/tokens";
import { useModeContext } from "@/providers";

export default function RomanceChats() {
  const { context: modeContext } = useModeContext();
  return (
    <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
      <ChatsHeader mode={modeContext.active_mode ?? undefined} />
      <ChatsInboxContent sourceMode="romance" />
      <RomanceBottomNav />
    </View>
  );
}
