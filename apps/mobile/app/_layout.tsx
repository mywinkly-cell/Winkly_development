// apps/mobile/app/_layout.tsx
// Root layout: Providers + Route guards (spec v8.1)

import React, { useCallback, useEffect, useState } from "react";
import { getAnalyticsConsent } from "@/lib/analyticsConsent";
import { View, ActivityIndicator, LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
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
import { DateSafetyPromptHost } from "@/components/safety/DateSafetyPromptHost";
import { AuthProvider, ModeContextProvider, NetworkProvider, ThemeProvider } from "@/providers";
import { LastActivitySync } from "@/components/LastActivitySync";
import { RouteGuard } from "@/components/RouteGuard";
import { NotificationDeepLinkHandler } from "@/components/NotificationDeepLinkHandler";
import { ScreenTopSpacer } from "@/components/ScreenTopSpacer";
import { PostHogIdentitySync, PostHogScreenTracker } from "@/components/PostHogAnalytics";
import { Colors } from "@/constants/tokens";
import { POSTHOG_API_KEY, POSTHOG_HOST } from "@/constants/config";
import { initI18n } from "@/lib/i18n";
import {
  premiumContextStackScreenOptions,
  premiumPushStackScreenOptions,
} from "@/lib/navigation/screenOptions";

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

/** Nested layouts only — cross-fade when switching tabs hub ↔ mode sub-app ↔ account. */
const CONTEXT_ROUTE_GROUPS = ["(tabs)", "(modes)", "account"] as const;

function RootLayout() {
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
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  const readyToRender = (fontsLoaded || fontsTimedOut) && i18nReady;
  const posthogEnabled = Boolean(POSTHOG_API_KEY) && analyticsConsent;

  useEffect(() => {
    const t = setTimeout(() => {
      if (!fontsLoaded) setFontsTimedOut(true);
    }, FONT_LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [fontsLoaded]);

  useEffect(() => {
    initI18n().then(() => setI18nReady(true));
  }, []);

  useEffect(() => {
    getAnalyticsConsent().then(setAnalyticsConsent);
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
    disabled: !posthogEnabled,
  };

  const content = (
    <NetworkProvider>
      <AuthProvider>
        <LastActivitySync />
        <ModeContextProvider>
          <ThemeProvider>
            <DateSafetyPromptHost />
            {posthogEnabled ? <PostHogIdentitySync /> : null}
            <RouteGuard>
              {posthogEnabled ? <PostHogScreenTracker /> : null}
              <NotificationDeepLinkHandler />
              <StatusBar style="dark" backgroundColor={Colors.backgroundMuted} />
              {isSplash ? null : <ScreenTopSpacer />}
              <Stack
                screenOptions={() => ({
                  ...premiumPushStackScreenOptions({
                    headerShown: false,
                    headerShadowVisible: false,
                    headerTitle: "",
                    contentStyle: {
                      backgroundColor: isSplash ? Colors.primaryViolet : Colors.backgroundMuted,
                    },
                  }),
                })}
              >
                {CONTEXT_ROUTE_GROUPS.map((name) => (
                  <Stack.Screen
                    key={name}
                    name={name}
                    options={premiumContextStackScreenOptions({ headerShown: false })}
                  />
                ))}
                <Stack.Screen
                  name="concierge"
                  options={{
                    ...premiumPushStackScreenOptions({ headerShown: false }),
                    // In-flow back is handled inside `ConciergePlanningFlow`; native swipe would exit the whole screen.
                    gestureEnabled: false,
                  }}
                />
              </Stack>
            </RouteGuard>
          </ThemeProvider>
        </ModeContextProvider>
      </AuthProvider>
    </NetworkProvider>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <SafeAreaProvider>
          <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
            {posthogEnabled ? (
              <PostHogProvider apiKey={POSTHOG_API_KEY} options={posthogOptions}>
                {content}
              </PostHogProvider>
            ) : (
              content
            )}
          </View>
        </SafeAreaProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

// @sentry/react-native/expo wraps the app entry (RootApp); init runs via sentry-init import above.
export default RootLayout;
