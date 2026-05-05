// ────────────────────────────────────────────────
// Winkly Friends Mode – Chats Screen
// Stays within Friends: ModeHeader + ChatsInboxContent + ModeBottomBar
// Friends tab is first and active by default
// ────────────────────────────────────────────────

import React from "react";
import { View } from "react-native";
import { ChatsHeader } from "@/components/layout/ChatsHeader";
import { FriendsBottomNav } from "@/components/layout/FriendsBottomNav";
import { ChatsInboxContent } from "@/components/chats/ChatsInboxContent";
import { Colors } from "@/constants/tokens";

export default function FriendsChats() {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
      <ChatsHeader />
      <ChatsInboxContent sourceMode="friends" />
      <FriendsBottomNav />
    </View>
  );
}
