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
import { useModeContext } from "@/providers";

export default function BusinessChats() {
  const { context: modeContext } = useModeContext();
  return (
    <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
      <ChatsHeader mode={modeContext.active_mode ?? undefined} />
      <ChatsInboxContent sourceMode="business" />
      <ModeBottomBar mode="business" />
    </View>
  );
}
