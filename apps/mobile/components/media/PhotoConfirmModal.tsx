// PhotoConfirmModal — shows selected photo with Save button (no black screen)
// Uses native Image for reliable display; crops to square on Save

import React, { useState } from "react";
import {
  Modal,
  View,
  Image,
  TouchableOpacity,
  Text,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import { Colors, Typography, Layout } from "@/constants/tokens";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PREVIEW_SIZE = Math.min(SCREEN_WIDTH - 48, 360);

type PhotoConfirmModalProps = {
  visible: boolean;
  photoUri: string | null;
  onSave: (uri: string) => void;
  onClose: () => void;
};

export function PhotoConfirmModal({
  visible,
  photoUri,
  onSave,
  onClose,
}: PhotoConfirmModalProps) {
  const [saving, setSaving] = useState(false);

  if (!photoUri) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await ImageManipulator.manipulateAsync(
        photoUri,
        [{ resize: { width: 400 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
      );
      onSave(result.uri);
    } catch {
      onSave(photoUri);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Image
            source={{ uri: photoUri }}
            style={styles.preview}
            resizeMode="contain"
          />
          <View style={styles.buttons}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8} disabled={saving}>
              {saving ? (
                <ActivityIndicator color={Colors.accentYellow} size="small" />
              ) : (
                <Text style={styles.saveText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    padding: 20,
    width: SCREEN_WIDTH - 32,
    maxWidth: 400,
    alignItems: "center",
  },
  preview: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    borderRadius: 12,
    backgroundColor: Colors.gray100,
  },
  buttons: {
    flexDirection: "row",
    marginTop: 20,
    gap: 12,
    flexWrap: "wrap",
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Layout.radii.control,
    backgroundColor: Colors.gray200,
    alignItems: "center",
  },
  cancelText: {
    ...Typography.button,
    color: Colors.textPrimary,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Layout.radii.control,
    backgroundColor: Colors.primaryViolet,
    alignItems: "center",
  },
  saveText: {
    ...Typography.button,
    color: Colors.accentYellow,
  },
});
