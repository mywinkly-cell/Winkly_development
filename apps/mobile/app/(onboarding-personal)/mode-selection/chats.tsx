// ────────────────────────────────────────────────
// Mode-selection Chats — Chats with ModeSelection chrome
// sourceMode="all" → All tab first
// ────────────────────────────────────────────────

import React from "react";
import { View, StyleSheet } from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import { ChatsHeader } from "@/components/layout/ChatsHeader";
import { ModeSelectionBottomBar } from "@/components/layout/ModeSelectionBottomBar";
import { ChatsInboxContent } from "@/components/chats/ChatsInboxContent";
import { Colors } from "@/constants/tokens";
import { useModeContext } from "@/providers";

export default function ModeSelectionChats() {
  const { context: modeContext } = useModeContext();
  return (
    <SafeScreenView edges={["left", "right"]} style={styles.screen}>
      <ChatsHeader mode={modeContext.active_mode ?? undefined} />
      <View style={styles.content}>
        <ChatsInboxContent sourceMode="all" />
      </View>
      <ModeSelectionBottomBar />
    </SafeScreenView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  content: { flex: 1 },
});
