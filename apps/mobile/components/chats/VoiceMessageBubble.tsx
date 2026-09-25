import React, { useCallback } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useTranslation } from "react-i18next";
import { Colors } from "@/constants/tokens";

type Props = {
  audioUrl: string;
  mine?: boolean;
  accentColor: string;
  pending?: boolean;
  durationMs?: number;
};

export function VoiceMessageBubble({
  audioUrl,
  mine,
  accentColor,
  pending = false,
  durationMs,
}: Props) {
  const { t } = useTranslation();
  const player = useAudioPlayer(audioUrl, { downloadFirst: !pending });
  const status = useAudioPlayerStatus(player);

  const toggle = useCallback(() => {
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  }, [player, status.playing]);

  const durSec =
    durationMs != null
      ? Math.max(1, Math.round(durationMs / 1000))
      : status.duration > 0
        ? Math.floor(status.duration)
        : null;
  const pos = status.currentTime ?? 0;
  const label = pending
    ? durSec != null
      ? t("chat.voice.sendingDuration", { duration: `0:${durSec.toString().padStart(2, "0")}` })
      : t("chat.voice.sending")
    : durSec != null
      ? t("chat.voice.progress", { position: Math.floor(pos), total: durSec })
      : status.isLoaded === false
        ? t("common.loading")
        : t("chat.voiceMessage");

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
        borderColor: mine ? accentColor + (pending ? "28" : "40") : Colors.gray200,
        backgroundColor: mine ? accentColor + (pending ? "08" : "12") : Colors.backgroundLight,
        minWidth: 200,
        opacity: pending ? 0.82 : 1,
      }}
    >
      <Pressable
        onPress={toggle}
        accessibilityLabel={
          pending ? t("chat.voice.sendingA11y") : status.playing ? t("chat.voice.pause") : t("chat.voice.play")
        }
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: accentColor + "28",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {pending || status.isBuffering ? (
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
