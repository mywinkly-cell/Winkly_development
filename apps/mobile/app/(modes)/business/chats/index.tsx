import React from "react";
import { View } from "react-native";
import { ChatsHeader } from "@/components/layout/ChatsHeader";
import { BusinessBottomNav } from "@/components/layout/BusinessBottomNav";
import { ChatsInboxContent } from "@/components/chats/ChatsInboxContent";
import { useAppTheme } from "@/constants/design-system";
import { useModeContext } from "@/providers";

export default function BusinessChats() {
  const { context: modeContext } = useModeContext();
  const theme = useAppTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ChatsHeader mode={modeContext.active_mode ?? "business"} />
      <ChatsInboxContent sourceMode="business" />
      <BusinessBottomNav />
    </View>
  );
}
