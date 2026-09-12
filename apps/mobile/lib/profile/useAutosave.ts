// lib/profile/useAutosave.ts
// React hook wrapper around AutosaveEngine — see that file for the actual
// debounce/diff/retry behavior. This hook just wires the engine into a
// component's lifecycle and exposes a status string for a "Saving…/Saved"
// indicator.
import { useEffect, useRef, useState } from "react";
import { AutosaveEngine, type AutosaveStatus } from "./autosaveEngine";

export interface UseAutosaveOptions<T extends Record<string, unknown>> {
  /** The full, current set of fields to keep in sync. Recomputed each render. */
  values: T;
  /** Persist only the changed fields (never overwrite untouched ones). Throw on failure. */
  onSave: (changed: Partial<T>, all: T) => Promise<void>;
  /**
   * Gate autosaving until initial data has finished loading. The first render
   * where `enabled` is true establishes the save baseline without saving —
   * it never mistakes "just loaded from the server" for a user edit.
   */
  enabled?: boolean;
  debounceMs?: number;
  retryDelaysMs?: number[];
  /** AsyncStorage key used to persist an unsent diff across app restarts. */
  draftStorageKey?: string;
}

export interface UseAutosaveResult {
  status: AutosaveStatus;
  /** Save immediately, skipping the debounce window (e.g. before navigating away). */
  flush: () => Promise<void>;
}

export function useAutosave<T extends Record<string, unknown>>({
  values,
  onSave,
  enabled = true,
  debounceMs,
  retryDelaysMs,
  draftStorageKey,
}: UseAutosaveOptions<T>): UseAutosaveResult {
  const [status, setStatus] = useState<AutosaveStatus>("idle");

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const engineRef = useRef<AutosaveEngine<T> | null>(null);
  if (!engineRef.current) {
    engineRef.current = new AutosaveEngine<T>({
      initialValues: values,
      onSave: (changed, all) => onSaveRef.current(changed, all),
      onStatusChange: setStatus,
      debounceMs,
      retryDelaysMs,
      draftStorageKey,
    });
  }

  useEffect(() => {
    const engine = engineRef.current;
    void engine?.hydrate();
    return () => engine?.dispose();
    // Engine is created once and owns its own lifecycle.
  }, []);

  const wasEnabledRef = useRef(false);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!enabled) {
      wasEnabledRef.current = false;
      return;
    }
    if (!wasEnabledRef.current) {
      wasEnabledRef.current = true;
      engine.resetBaseline(values);
      return;
    }
    engine.update(values);
  }, [values, enabled]);

  return {
    status,
    flush: () => engineRef.current!.flush(),
  };
}
