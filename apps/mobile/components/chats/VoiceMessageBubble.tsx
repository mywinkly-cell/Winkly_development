import React, { useCallback } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Colors } from "@/constants/tokens";

type Props = {
  audioUrl: string;
  mine?: boolean;
  accentColor: string;
};

export function VoiceMessageBubble({ audioUrl, mine, accentColor }: Props) {
  const player = useAudioPlayer(audioUrl, { downloadFirst: true });
  const status = useAudioPlayerStatus(player);

  const toggle = useCallback(() => {
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  }, [player, status.playing]);

  const dur = status.duration > 0 ? status.duration : null;
  const pos = status.currentTime ?? 0;
  const label =
    dur != null ? `${Math.floor(pos)}s / ${Math.floor(dur)}s` : status.isLoaded === false ? "Loading…" : "Voice message";

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: mine ? accentColor + "40" : Colors.gray200,
        backgroundColor: mine ? accentColor + "12" : Colors.backgroundLight,
        minWidth: 200,
      }}
    >
      <Pressable
        onPress={toggle}
        accessibilityLabel={status.playing ? "Pause voice message" : "Play voice message"}
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: accentColor + "28",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {status.isBuffering ? (
          <ActivityIndicator size="small" color={accentColor} />
        ) : (
          <Ionicons name={status.playing ? "pause" : "play"} size={22} color={accentColor} />
        )}
      </Pressable>
      <Text style={{ flex: 1, fontSize: 14, color: Colors.textPrimary }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
