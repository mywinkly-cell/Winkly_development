// apps/mobile/components/media/MediaPicker.tsx
// Media picker wrapper around expo-image-picker.

import React, { useCallback } from "react";
import { Pressable, Text, StyleSheet, ViewStyle } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Colors, Typography, Layout } from "@/constants/tokens";

export type PickedMedia = {
  uri: string;
  width?: number;
  height?: number;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
};

export type MediaPickerProps = {
  title?: string;
  style?: ViewStyle;
  onPicked: (items: PickedMedia[]) => void;
  allowsMultipleSelection?: boolean;
  mediaTypes?: "images" | "videos" | "all";
};

export function MediaPicker({
  title = "Add media",
  style,
  onPicked,
  allowsMultipleSelection = true,
  mediaTypes = "images",
}: MediaPickerProps) {
  const pick = useCallback(async () => {
    Haptics.selectionAsync();

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection,
      mediaTypes:
        mediaTypes === "images"
          ? ImagePicker.MediaTypeOptions.Images
          : mediaTypes === "videos"
            ? ImagePicker.MediaTypeOptions.Videos
            : ImagePicker.MediaTypeOptions.All,
      quality: 0.9,
    });

    if (result.canceled) return;

    const assets = result.assets ?? [];
    onPicked(
      assets.map((a) => ({
        uri: a.uri,
        width: a.width,
        height: a.height,
        mimeType: (a as any).mimeType,
        fileName: (a as any).fileName,
        fileSize: (a as any).fileSize,
      }))
    );
  }, [allowsMultipleSelection, mediaTypes, onPicked]);

  return (
    <Pressable onPress={pick} style={[styles.btn, style]} accessibilityRole="button">
      <Text style={styles.text}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: Layout.touchTargetMin,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: Layout.radii.control,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  text: { ...Typography.button, color: Colors.textPrimary },
});

