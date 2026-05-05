// ────────────────────────────────────────────────
// Mode-selection Chats — Chats with ModeSelection chrome
// sourceMode="all" → All tab first
// ────────────────────────────────────────────────

import React from "react";
import { View, StyleSheet } from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import { ModeSelectionHeader } from "@/components/layout/ModeSelectionHeader";
import { ModeSelectionBottomBar } from "@/components/layout/ModeSelectionBottomBar";
import { ChatsInboxContent } from "@/components/chats/ChatsInboxContent";
import { Colors } from "@/constants/tokens";

export default function ModeSelectionChats() {
  return (
    <SafeScreenView edges={["left", "right"]} style={styles.screen}>
      <ModeSelectionHeader />
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
