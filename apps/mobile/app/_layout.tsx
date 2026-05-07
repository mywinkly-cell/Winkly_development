// apps/mobile/app/_layout.tsx
// Root layout: Providers + Route guards (spec v8.1)

import React, { useCallback, useEffect, useState } from "react";
import { View, ActivityIndicator, LogBox, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "@expo-google-fonts/poppins/useFonts";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import * as SplashScreen from "expo-splash-screen";
import { PostHogProvider } from "posthog-react-native";
import { AuthProvider, ModeContextProvider, ThemeProvider } from "@/providers";
import { RouteGuard } from "@/components/RouteGuard";
import { ScreenTopSpacer } from "@/components/ScreenTopSpacer";
import { PostHogIdentitySync, PostHogScreenTracker } from "@/components/PostHogAnalytics";
import { Colors } from "@/constants/tokens";
import { POSTHOG_API_KEY, POSTHOG_HOST } from "@/constants/config";
import { initI18n } from "@/lib/i18n";

SplashScreen.preventAutoHideAsync();

/** If fonts hang (common on Expo Go), proceed after 5s to avoid blank screen */
const FONT_LOAD_TIMEOUT_MS = 5000;

// Show errors only in terminal, not in-app overlay
if (typeof console !== "undefined" && "reportErrorsAsExceptions" in console) {
  (console as { reportErrorsAsExceptions?: boolean }).reportErrorsAsExceptions = false;
}

// Suppress VirtualizedLists nesting warning (we fix root causes; this hides any edge-case remnants)
LogBox.ignoreLogs(["VirtualizedLists should never be nested"]);

// Keep-awake warnings are noisy on Expo Go; do not suppress generic network errors in dev (hurts Supabase debugging).
if (!__DEV__) {
  LogBox.ignoreLogs([
    "Unable to activate keep awake",
    "Unable to deactivate keep awake",
  ]);
}

/** Native-stack: horizontal transition enables swipe-to-go-back on Android; fade disables it. */
function stackAnimation(): "default" | "slide_from_right" | "fade" {
  if (Platform.OS === "ios") return "default";
  if (Platform.OS === "android") return "slide_from_right";
  return "fade";
}

export default function RootLayout() {
  const segments = useSegments();
  const isSplash = (segments as string[]).includes("splash") || segments.some((s) => String(s).endsWith("splash"));

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const [fontsTimedOut, setFontsTimedOut] = useState(false);
  const [i18nReady, setI18nReady] = useState(false);
  const readyToRender = (fontsLoaded || fontsTimedOut) && i18nReady;

  useEffect(() => {
    const t = setTimeout(() => {
      if (!fontsLoaded) setFontsTimedOut(true);
    }, FONT_LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [fontsLoaded]);

  useEffect(() => {
    initI18n().then(() => setI18nReady(true));
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (readyToRender) await SplashScreen.hideAsync();
  }, [readyToRender]);

  if (!readyToRender) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.primaryViolet }}>
            <ActivityIndicator size="large" color="#FFFFFF" />
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  const posthogOptions = {
    host: POSTHOG_HOST,
    captureAppLifecycleEvents: true,
    disabled: !POSTHOG_API_KEY,
  };

  const content = (
    <AuthProvider>
      <ModeContextProvider>
        <ThemeProvider>
          {POSTHOG_API_KEY ? <PostHogIdentitySync /> : null}
          <RouteGuard>
            {POSTHOG_API_KEY ? <PostHogScreenTracker /> : null}
            <StatusBar style="dark" backgroundColor={Colors.backgroundMuted} />
            {isSplash ? null : <ScreenTopSpacer />}
            <Stack
              screenOptions={() => ({
                headerShown: false,
                headerShadowVisible: false,
                headerTitle: "",
                contentStyle: {
                  backgroundColor: isSplash ? Colors.primaryViolet : Colors.backgroundMuted,
                },
                animation: stackAnimation(),
                gestureEnabled: true,
              })}
            >
              <Stack.Screen
                name="concierge"
                options={{
                  // In-flow back is handled inside `ConciergePlanningFlow`; native swipe would exit the whole screen.
                  gestureEnabled: false,
                }}
              />
            </Stack>
          </RouteGuard>
        </ThemeProvider>
      </ModeContextProvider>
    </AuthProvider>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
          {POSTHOG_API_KEY ? (
            <PostHogProvider apiKey={POSTHOG_API_KEY} options={posthogOptions}>
              {content}
            </PostHogProvider>
          ) : (
            content
          )}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
