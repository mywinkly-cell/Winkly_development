import React from "react";
import { View } from "react-native";
import { ChatsHeader } from "@/components/layout/ChatsHeader";
import { FriendsBottomNav } from "@/components/layout/FriendsBottomNav";
import { ChatsInboxContent } from "@/components/chats/ChatsInboxContent";
import { useAppTheme } from "@/constants/design-system";
import { useModeContext } from "@/providers";

export default function FriendsChats() {
  const { context: modeContext } = useModeContext();
  const theme = useAppTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ChatsHeader mode={modeContext.active_mode ?? "friends"} />
      <ChatsInboxContent sourceMode="friends" />
      <FriendsBottomNav />
    </View>
  );
}
