import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Colors, Typography, Layout } from "@/constants/tokens";

type Msg = { id: string; from: string; text: string; at: string };

export default function GroupChat() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();

  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    { id: "1", from: "System", text: "Welcome to the group chat (MVP).", at: new Date().toISOString() },
    { id: "2", from: "Alex", text: "Hi everyone 👋", at: new Date().toISOString() },
  ]);

  const canSend = useMemo(() => draft.trim().length > 0, [draft]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;

    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}`, from: "You", text, at: new Date().toISOString() },
    ]);
    setDraft("");
  };

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Chat</Text>
        <View style={{ width: 70 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.chat} showsVerticalScrollIndicator={false}>
          <Text style={styles.chatMeta}>Group: {String(groupId ?? "")}</Text>

          {messages.map((m) => (
            <View key={m.id} style={[styles.bubble, m.from === "You" ? styles.bubbleMe : styles.bubbleOther]}>
              <Text style={styles.bubbleFrom}>{m.from}</Text>
              <Text style={styles.bubbleText}>{m.text}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message…"
            placeholderTextColor={Colors.gray500}
            style={styles.input}
            multiline
          />
          <TouchableOpacity
            onPress={send}
            disabled={!canSend}
            style={[styles.sendBtn, !canSend && { opacity: 0.4 }]}
            activeOpacity={0.9}
          >
            <Text style={styles.sendText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, ...Layout.topHeaderBar },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  headerTitle: { ...Typography.headerTitle, color: Colors.textPrimary },

  chat: { paddingHorizontal: 20, paddingBottom: 14 },
  chatMeta: { ...Typography.caption, color: Colors.gray600, marginBottom: 10 },

  bubble: {
    maxWidth: "86%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
  },
  bubbleMe: { alignSelf: "flex-end", backgroundColor: "#FFF", borderColor: Colors.gray200 },
  bubbleOther: { alignSelf: "flex-start", backgroundColor: Colors.gray100, borderColor: Colors.gray200 },

  bubbleFrom: { ...Typography.caption, color: Colors.gray600, marginBottom: 4 },
  bubbleText: { ...Typography.body, color: Colors.textPrimary },

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
    backgroundColor: "#FFF",
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderRadius: Layout.radii.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.textPrimary,
    maxHeight: 120,
  },
  sendBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sendText: { ...Typography.button, color: Colors.accentYellow },
});
