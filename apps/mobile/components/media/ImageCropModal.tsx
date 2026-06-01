// ImageCropModal — interactive crop UI.
// Uses the maintained `expo-dynamic-image-crop` (gesture-based crop on top of the
// official `expo-image-manipulator`). Replaces the abandoned
// `@neilromblon/expo-image-manipulator-view` (see SECURITY.md dependency audit).
//
// The image URI is normalized to a readable temp JPEG first to avoid issues with
// content:// URIs and very large images on some Android devices.

import React, { useEffect, useState } from "react";
import { Modal, View, ActivityIndicator, Text, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ImageEditor } from "expo-dynamic-image-crop";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import { cacheDirectory } from "expo-file-system/legacy";
import { Colors } from "@/constants/tokens";

type ImageCropModalProps = {
  visible: boolean;
  photoUri: string | null;
  onSave: (uri: string) => void;
  onClose: () => void;
};

/** Normalize URI via ImageManipulator — outputs a temp file the editor can read reliably. */
async function normalizeUriForCrop(uri: string): Promise<string> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1920 } }],
      { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch {
    try {
      const cacheDir = cacheDirectory;
      if (cacheDir) {
        const ext = uri.toLowerCase().includes(".png") ? "png" : "jpg";
        const dest = `${cacheDir}winkly_crop_src_${Date.now()}.${ext}`;
        await FileSystem.copyAsync({ from: uri, to: dest });
        return dest.startsWith("file://") ? dest : `file://${dest}`;
      }
    } catch { /* fall through */ }
    return uri;
  }
}

export function ImageCropModal({
  visible,
  photoUri,
  onSave,
  onClose,
}: ImageCropModalProps) {
  const [normalizedUri, setNormalizedUri] = useState<string | null>(null);
  const [normalizing, setNormalizing] = useState(false);

  useEffect(() => {
    if (visible && photoUri) {
      setNormalizing(true);
      normalizeUriForCrop(photoUri)
        .then((u) => {
          setNormalizedUri(u);
        })
        .catch(() => setNormalizedUri(photoUri))
        .finally(() => setNormalizing(false));
    } else {
      setNormalizedUri(null);
    }
  }, [visible, photoUri]);

  if (!photoUri) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* GestureHandlerRootView is required for gestures to work inside a RN Modal (esp. Android). */}
      <GestureHandlerRootView style={styles.root}>
        {normalizing || !normalizedUri ? (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={Colors.primaryViolet} />
              <Text style={styles.loadingText}>Preparing crop…</Text>
            </View>
          </View>
        ) : (
          <ImageEditor
            useModal={false}
            imageUri={normalizedUri}
            onEditingComplete={(data) => onSave(data.uri)}
            onEditingCancel={onClose}
          />
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000000",
  },
  loadingOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingBox: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: Colors.textPrimary,
  },
});
