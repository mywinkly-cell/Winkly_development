/**
 * Shows a one-time in-app rationale before requesting location on first entry to a mode.
 * Mirrors the permission flow in planner/settings.tsx — never prompts the OS without context.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking } from "react-native";
import * as Location from "expo-location";
import { useSegments } from "expo-router";
import { useModeContext } from "@/providers/ModeContextProvider";
import type { AppMode } from "@/lib/chats/types";
import {
  hasShownModeLocationRationale,
  markModeLocationRationaleShown,
} from "@/lib/location/modeLocationPrompt";
import { updateMyLocationOnAppOpen } from "@/lib/location/updateLocation";
import { ModeLocationRationaleModal } from "@/components/location/ModeLocationRationaleModal";

const MODES: AppMode[] = ["romance", "friends", "business", "events"];

function modeFromSegments(segments: string[]): AppMode | null {
  for (const s of segments) {
    if (MODES.includes(s as AppMode)) return s as AppMode;
  }
  return null;
}

export function ModeLocationGate() {
  const { context } = useModeContext();
  const segments = useSegments();
  const mode = (context.active_mode as AppMode | null) ?? modeFromSegments(segments as string[]);

  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const checkedModes = useRef<Set<AppMode>>(new Set());

  const dismiss = useCallback(async (targetMode: AppMode) => {
    await markModeLocationRationaleShown(targetMode);
    setVisible(false);
  }, []);

  useEffect(() => {
    if (!mode || !MODES.includes(mode)) return;
    if (checkedModes.current.has(mode)) return;

    let cancelled = false;
    checkedModes.current.add(mode);

    (async () => {
      try {
        const [{ status }, shown] = await Promise.all([
          Location.getForegroundPermissionsAsync(),
          hasShownModeLocationRationale(mode),
        ]);
        if (cancelled) return;

        if (status === "granted" || shown) {
          if (status === "granted" && !shown) {
            await markModeLocationRationaleShown(mode);
          }
          if (status === "granted") {
            await updateMyLocationOnAppOpen({ promptIfNeeded: false });
          }
          return;
        }

        setVisible(true);
      } catch {
        checkedModes.current.delete(mode);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode]);

  const handleAllow = useCallback(async () => {
    if (!mode) return;
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      await dismiss(mode);
      if (status === "granted") {
        await updateMyLocationOnAppOpen({ force: true, promptIfNeeded: false });
      } else if (status === "denied") {
        Alert.alert(
          "Location access",
          "You can still use Winkly without location. Enable access in your device settings when you're ready.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open settings", onPress: () => Linking.openSettings() },
          ],
        );
      }
    } catch {
      if (mode) await dismiss(mode);
      Alert.alert("Error", "Could not request location access. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [dismiss, mode]);

  const handleSkip = useCallback(async () => {
    if (!mode) {
      setVisible(false);
      return;
    }
    await dismiss(mode);
  }, [dismiss, mode]);

  if (!mode) return null;

  return (
    <ModeLocationRationaleModal
      visible={visible}
      mode={mode}
      loading={loading}
      onAllow={handleAllow}
      onSkip={handleSkip}
    />
  );
}
