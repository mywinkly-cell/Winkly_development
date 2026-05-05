import React, { useState } from "react";
import { View, Text, TextInput, Pressable, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography } from "@/constants/tokens";

type Props = {
  visible: boolean;
  onClose: () => void;
  onAttach: (gifUrl: string) => void;
};

/** Attach a GIF by pasting a direct image URL (e.g. from Giphy/Tenor “Copy link” to media). */
export function GifUrlSheet({ visible, onClose, onAttach }: Props) {
  const [url, setUrl] = useState("");

  const submit = () => {
    const u = url.trim();
    if (!u.startsWith("http")) return;
    onAttach(u);
    setUrl("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            backgroundColor: Colors.white,
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            padding: 18,
            paddingBottom: 28,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={{ ...Typography.h3, fontSize: 17 }}>Send a GIF</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={26} color={Colors.gray600} />
            </Pressable>
          </View>
          <Text style={{ fontSize: 13, color: Colors.gray600, marginBottom: 10 }}>
            Paste a direct GIF or image URL (HTTPS). Many apps offer a “copy GIF link” or media URL.
          </Text>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://…"
            placeholderTextColor={Colors.gray500}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={{
              borderWidth: 1,
              borderColor: Colors.gray200,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 12,
              fontSize: 15,
              marginBottom: 14,
            }}
          />
          <Pressable
            onPress={submit}
            disabled={!url.trim().startsWith("http")}
            style={{
              backgroundColor: url.trim().startsWith("http") ? Colors.primaryViolet : Colors.gray200,
              paddingVertical: 14,
              borderRadius: 14,
              alignItems: "center",
            }}
          >
            <Text style={{ color: Colors.white, fontWeight: "700", fontSize: 16 }}>Attach GIF</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
