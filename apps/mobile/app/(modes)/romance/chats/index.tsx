import React from "react";
import { View } from "react-native";
import { ChatsHeader } from "@/components/layout/ChatsHeader";
import { RomanceBottomNav } from "@/components/layout/RomanceBottomNav";
import { ChatsInboxContent } from "@/components/chats/ChatsInboxContent";
import { useAppTheme } from "@/constants/design-system";
import { useModeContext } from "@/providers";

export default function RomanceChats() {
  const { context: modeContext } = useModeContext();
  const theme = useAppTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ChatsHeader mode={modeContext.active_mode ?? "romance"} />
      <ChatsInboxContent sourceMode="romance" />
      <RomanceBottomNav />
    </View>
  );
}
