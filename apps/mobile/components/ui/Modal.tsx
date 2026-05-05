// apps/mobile/components/ui/Modal.tsx
// Token-based modal wrapper (backdrop + centered card).

import React from "react";
import { Modal as RNModal, Pressable, View, StyleSheet, ViewStyle, KeyboardAvoidingView, Platform } from "react-native";
import { Colors, Layout } from "@/constants/tokens";

export type ModalProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /**
   * "center" is good for dialogs. Use "sheet" for bottom sheets (card anchored to bottom).
   */
  variant?: "center" | "sheet";
  cardStyle?: ViewStyle;
  backdropStyle?: ViewStyle;
  closeOnBackdropPress?: boolean;
};

export function Modal({
  visible,
  onClose,
  children,
  variant = "center",
  cardStyle,
  backdropStyle,
  closeOnBackdropPress = true,
}: ModalProps) {
  return (
    <RNModal visible={visible} transparent animationType={variant === "sheet" ? "slide" : "fade"} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.root}>
        <Pressable
          style={[styles.backdrop, backdropStyle]}
          onPress={closeOnBackdropPress ? onClose : undefined}
          accessibilityLabel="Close modal"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.card,
              variant === "sheet" ? styles.sheetCard : styles.centerCard,
              cardStyle,
            ]}
          >
            <View>{children}</View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    padding: Layout.spacing.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    width: "100%",
    maxWidth: 520,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
    overflow: "hidden",
  },
  centerCard: {
    padding: Layout.spacing.lg,
  },
  sheetCard: {
    padding: Layout.spacing.lg,
    marginTop: "auto",
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
});

