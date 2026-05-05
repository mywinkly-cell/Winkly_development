// apps/mobile/components/ui/Toast.tsx
// Lightweight toast notifications (provider + viewport).

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Colors, Typography, Layout } from "@/constants/tokens";

export type ToastVariant = "default" | "success" | "error";

export type ToastOptions = {
  variant?: ToastVariant;
  durationMs?: number;
};

type ToastState = {
  id: string;
  message: string;
  variant: ToastVariant;
  durationMs: number;
};

type ToastContextValue = {
  show: (message: string, options?: ToastOptions) => void;
  hide: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setToast(null));
  }, [anim]);

  const show = useCallback(
    (message: string, options?: ToastOptions) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      const next: ToastState = {
        id: String(Date.now()),
        message,
        variant: options?.variant ?? "default",
        durationMs: options?.durationMs ?? 2400,
      };
      setToast(next);
      Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      hideTimer.current = setTimeout(hide, next.durationMs);
    },
    [anim, hide]
  );

  const value = useMemo(() => ({ show, hide }), [show, hide]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toast={toast} anim={anim} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toast, anim }: { toast: ToastState | null; anim: Animated.Value }) {
  if (!toast) return null;

  const palette = getVariantPalette(toast.variant);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={[styles.toast, palette.container]}>
        <Text style={[styles.text, { color: palette.text }]} numberOfLines={3}>
          {toast.message}
        </Text>
      </View>
    </Animated.View>
  );
}

function getVariantPalette(variant: ToastVariant): { container: ViewStyle; text: string } {
  switch (variant) {
    case "success":
      return { container: { backgroundColor: Colors.successGreen }, text: Colors.white };
    case "error":
      return { container: { backgroundColor: Colors.errorRed }, text: Colors.white };
    default:
      return { container: { backgroundColor: Colors.softBlack }, text: Colors.white };
  }
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 22,
    paddingHorizontal: Layout.spacing.lg,
    alignItems: "center",
  },
  toast: {
    width: "100%",
    maxWidth: 560,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  text: {
    ...Typography.body,
    fontSize: 15,
    lineHeight: 20,
  },
});

