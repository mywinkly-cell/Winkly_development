// apps/mobile/components/LastActivitySync.tsx
// Records local last-activity while the user has an active session (foreground).

import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useAuth } from "@/providers/AuthProvider";
import { recordLastActivity } from "@/lib/lastActivity";

export function LastActivitySync() {
  const { session } = useAuth();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (!session?.user) return;

    void recordLastActivity();

    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        void recordLastActivity();
      }
      appState.current = next;
    });

    return () => sub.remove();
  }, [session?.user?.id]);

  return null;
}
