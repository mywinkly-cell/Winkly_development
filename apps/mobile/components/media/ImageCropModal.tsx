// ImageCropModal — crop UI (avoids black screen by using normalized file URI)

import React, { useEffect, useState } from "react";
import { Modal, View, ActivityIndicator, Text, StyleSheet } from "react-native";
import ImageManipulatorView from "@neilromblon/expo-image-manipulator-view";
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

/** Normalize URI via ImageManipulator — outputs a temp file ImageManipulatorView can read (fixes black screen) */
async function normalizeUriForCrop(uri: string): Promise<string> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1920 } }], // normalize to temp file ImageManipulatorView can read
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

  if (normalizing) {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={Colors.primaryViolet} />
            <Text style={styles.loadingText}>Preparing crop…</Text>
          </View>
        </View>
      </Modal>
    );
  }

  if (!normalizedUri) return null;

  return (
    <ImageManipulatorView
      isVisible={visible}
      photo={{ uri: normalizedUri }}
      onToggleModal={onClose}
      onPictureChoosed={(data) => onSave(data.uri)}
      btnTexts={{
        crop: "Save",
        done: "Save",
        processing: "Saving…",
      }}
      saveOptions={{
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: false,
      }}
      allowRotate={false}
      allowFlip={false}
    />
  );
}

const styles = StyleSheet.create({
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
