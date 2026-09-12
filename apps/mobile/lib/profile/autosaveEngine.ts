// lib/profile/autosaveEngine.ts
// Framework-agnostic autosave engine shared by the profile onboarding screen
// and the standalone profile edit screens.
//
// Responsibilities:
// - Debounce rapid field edits into a single save of only the changed fields.
// - Never overwrite a field with an empty value just because a sibling field
//   changed: callers only ever receive the keys that actually changed.
// - Survive offline/failed saves: the unsent diff is persisted to AsyncStorage
//   and retried with backoff, so a killed app or a flaky connection never
//   loses input.
import AsyncStorage from "@react-native-async-storage/async-storage";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 1000;
export const DEFAULT_AUTOSAVE_RETRY_DELAYS_MS = [3000, 6000, 12000, 30000];

function isEqualValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b) || (a && typeof a === "object") || (b && typeof b === "object")) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

/** Shallow (per-key) diff: returns only the keys of `next` whose value changed vs `prev`. */
export function diffValues<T extends Record<string, unknown>>(prev: T, next: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (!isEqualValue(prev[key], next[key])) {
      out[key] = next[key];
    }
  }
  return out;
}

export interface AutosaveEngineOptions<T extends Record<string, unknown>> {
  initialValues: T;
  /** Persist only the changed fields. Throw to signal failure and trigger a retry. */
  onSave: (changed: Partial<T>, all: T) => Promise<void>;
  onStatusChange?: (status: AutosaveStatus) => void;
  debounceMs?: number;
  retryDelaysMs?: number[];
  /** AsyncStorage key used to persist the not-yet-saved diff across app restarts. */
  draftStorageKey?: string;
}

/**
 * Tracks a value bag over time, debounces edits, and saves only what changed.
 * Not React-specific — see lib/profile/useAutosave.ts for the hook wrapper.
 */
export class AutosaveEngine<T extends Record<string, unknown>> {
  private lastSaved: T;
  private latestValues: T;
  private pending: Partial<T> = {};
  private status: AutosaveStatus = "idle";
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private savedResetTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private saving = false;
  private disposed = false;

  private readonly onSave: (changed: Partial<T>, all: T) => Promise<void>;
  private readonly onStatusChange?: (status: AutosaveStatus) => void;
  private readonly debounceMs: number;
  private readonly retryDelaysMs: number[];
  private readonly draftStorageKey?: string;

  constructor(opts: AutosaveEngineOptions<T>) {
    this.lastSaved = opts.initialValues;
    this.latestValues = opts.initialValues;
    this.onSave = opts.onSave;
    this.onStatusChange = opts.onStatusChange;
    this.debounceMs = opts.debounceMs ?? DEFAULT_AUTOSAVE_DEBOUNCE_MS;
    this.retryDelaysMs = opts.retryDelaysMs ?? DEFAULT_AUTOSAVE_RETRY_DELAYS_MS;
    this.draftStorageKey = opts.draftStorageKey;
  }

  getStatus(): AutosaveStatus {
    return this.status;
  }

  hasPendingChanges(): boolean {
    return Object.keys(this.pending).length > 0;
  }

  /** Reset the save baseline without triggering a save (e.g. once initial data has loaded). */
  resetBaseline(values: T): void {
    this.lastSaved = values;
    this.latestValues = values;
  }

  /** Restore a diff persisted before an app restart/crash and try saving it. */
  async hydrate(): Promise<void> {
    if (!this.draftStorageKey || this.disposed) return;
    try {
      const raw = await AsyncStorage.getItem(this.draftStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<T>;
      if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
        this.pending = { ...parsed, ...this.pending };
        this.scheduleRetry(0);
      }
    } catch {
      // corrupt draft; nothing to recover
    }
  }

  /** Call whenever the tracked values change. Debounces a save of the diff. */
  update(values: T): void {
    if (this.disposed) return;
    this.latestValues = values;
    const diff = diffValues(this.lastSaved, values);
    if (Object.keys(diff).length === 0) return;
    this.pending = { ...this.pending, ...diff };
    void this.persistPending();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.retryAttempt = 0;
      this.clearRetryTimer();
      void this.attemptSave();
    }, this.debounceMs);
  }

  /** Save immediately, skipping the debounce window (e.g. before navigating away). */
  async flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.clearRetryTimer();
    this.retryAttempt = 0;
    await this.attemptSave();
  }

  dispose(): void {
    this.disposed = true;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.savedResetTimer) clearTimeout(this.savedResetTimer);
  }

  private setStatus(next: AutosaveStatus) {
    this.status = next;
    this.onStatusChange?.(next);
  }

  private clearRetryTimer() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private scheduleRetry(delay: number) {
    this.clearRetryTimer();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.attemptSave();
    }, delay);
  }

  private async persistPending() {
    if (!this.draftStorageKey) return;
    try {
      if (Object.keys(this.pending).length === 0) {
        await AsyncStorage.removeItem(this.draftStorageKey);
      } else {
        await AsyncStorage.setItem(this.draftStorageKey, JSON.stringify(this.pending));
      }
    } catch {
      // best-effort; the screen's own full-state draft is the primary safety net
    }
  }

  private async attemptSave(): Promise<void> {
    if (this.disposed || this.saving) return;
    const diff = this.pending;
    if (!diff || Object.keys(diff).length === 0) return;
    this.saving = true;
    this.setStatus("saving");
    try {
      await this.onSave(diff, this.latestValues);
      if (this.disposed) return;

      // Only clear the keys we just saved that nobody changed again while the
      // request was in flight — anything newer stays pending for next round.
      const stillPending: Partial<T> = { ...this.pending };
      for (const key of Object.keys(diff)) {
        if (isEqualValue((stillPending as Record<string, unknown>)[key], (diff as Record<string, unknown>)[key])) {
          delete (stillPending as Record<string, unknown>)[key];
        }
      }
      this.lastSaved = { ...this.lastSaved, ...diff };
      this.pending = stillPending;
      this.retryAttempt = 0;
      await this.persistPending();
      this.setStatus("saved");

      if (this.savedResetTimer) clearTimeout(this.savedResetTimer);
      this.savedResetTimer = setTimeout(() => {
        this.savedResetTimer = null;
        if (!this.disposed) this.setStatus("idle");
      }, 2000);

      if (Object.keys(stillPending).length > 0) {
        this.scheduleRetry(0);
      }
    } catch (e) {
      if (this.disposed) return;
      console.warn("Autosave failed, will retry:", e);
      await this.persistPending();
      this.setStatus("error");
      const delay = this.retryDelaysMs[Math.min(this.retryAttempt, this.retryDelaysMs.length - 1)];
      this.retryAttempt += 1;
      this.scheduleRetry(delay);
    } finally {
      this.saving = false;
    }
  }
}
