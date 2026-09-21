// React glue for AutosaveController: feeds it the memoized profile draft and
// flushes on screen blur/unmount, app backgrounding and an explicit `flushKey`
// change (the wizard step index).

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { AutosaveController, type AutosaveStatus } from "./autosaveController";
import type { ProfileDraft } from "./profileAutosave";
import { saveProfilePatch } from "./saveProfilePatch";

type Options = {
  /** The single memoized draft of every editable field. */
  draft: ProfileDraft;
  /** False until the initial load finished (and while it re-runs) — nothing is saved before that. */
  ready: boolean;
  /** Turns the hydrated draft into "what the server already holds". Called once per hydration. */
  seedSaved: (hydrated: ProfileDraft) => ProfileDraft;
  /** Flush whenever this value changes (skipped on mount) — e.g. the wizard step. */
  flushKey?: string | number;
};

export function useProfileAutosave({ draft, ready, seedSaved, flushKey }: Options) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [controller] = useState(() => new AutosaveController(saveProfilePatch, setStatus));
  const seededRef = useRef(false);

  useEffect(() => {
    if (!ready) {
      seededRef.current = false;
      controller.setReady(false);
      return;
    }
    if (!seededRef.current) {
      seededRef.current = true;
      controller.setBaseline(seedSaved(draft));
      controller.setReady(true);
    }
    controller.update(draft);
  }, [controller, draft, ready, seedSaved]);

  const flush = useCallback(() => controller.flush(), [controller]);

  // Step change (Next / Back / jump).
  const lastFlushKey = useRef(flushKey);
  useEffect(() => {
    if (lastFlushKey.current === flushKey) return;
    lastFlushKey.current = flushKey;
    void controller.flush();
  }, [controller, flushKey]);

  // Screen blur (another screen pushed on top) and unmount.
  useFocusEffect(
    useCallback(() => () => {
      void controller.flush();
    }, [controller])
  );

  // Backgrounding. iOS reports "inactive" first (app switcher, incoming call), which
  // gives the request a head start before the app is suspended or killed.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background" || next === "inactive") void controller.flush();
    });
    return () => sub.remove();
  }, [controller]);

  // On unmount: start the last flush, then stop retry timers and status updates.
  useEffect(() => {
    controller.activate();
    return () => {
      void controller.flush();
      controller.dispose();
    };
  }, [controller]);

  return { status, flush };
}
