// Framework-free autosave state machine (debounce → single-flight save → backoff
// retry → flush). React glue lives in useProfileAutosave.ts.

import {
  AUTOSAVE_DEBOUNCE_MS,
  applyPatch,
  diffProfileDraft,
  emptyDraft,
  isPatchEmpty,
  retryDelayMs,
  type ProfileDraft,
  type ProfilePatch,
} from "./profileAutosave";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export type SaveResult = {
  /** The part of the patch that reached the server (may be a subset on partial failure). */
  persisted: ProfilePatch;
  failed: boolean;
};

export type AutosaveSaver = (patch: ProfilePatch) => Promise<SaveResult>;

export class AutosaveController {
  private lastSaved: ProfileDraft = emptyDraft();
  private current: ProfileDraft = emptyDraft();
  private ready = false;
  private disposed = false;
  private status: AutosaveStatus = "idle";
  private attempt = 0;

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<boolean> | null = null;
  private running = false;

  constructor(
    private readonly save: AutosaveSaver,
    private readonly onStatus: (status: AutosaveStatus) => void = () => {},
    private readonly debounceMs: number = AUTOSAVE_DEBOUNCE_MS
  ) {}

  getStatus(): AutosaveStatus {
    return this.status;
  }

  /** What the server is known to hold. Call before `setReady(true)`. */
  setBaseline(saved: ProfileDraft): void {
    this.lastSaved = saved;
  }

  /** Autosave is inert until hydration finished — otherwise empty initial state could overwrite real data. */
  setReady(ready: boolean): void {
    this.ready = ready;
    if (!ready) this.clearTimers();
  }

  /** Feed the latest draft. Cheap: a diff plus (re)arming the debounce timer. */
  update(draft: ProfileDraft): void {
    this.current = draft;
    if (!this.ready || this.disposed) return;

    if (isPatchEmpty(diffProfileDraft(this.lastSaved, draft))) {
      // Edited back to what is saved: nothing to write, and a stale timer would be a no-op anyway.
      this.clearDebounce();
      if (this.status === "saving" && !this.running) this.setStatus("saved");
      return;
    }
    if (this.status !== "error") this.setStatus("saving");
    this.clearDebounce();
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.drain();
    }, this.debounceMs);
  }

  /**
   * Write everything pending right now (no debounce). Resolves true when the server
   * matches the latest draft, false when a write failed (a retry is then scheduled).
   * Never rejects.
   */
  flush(): Promise<boolean> {
    this.clearTimers();
    return this.drain();
  }

  /** Undo `dispose()` — React StrictMode runs effect cleanup and setup back-to-back on mount. */
  activate(): void {
    this.disposed = false;
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimers();
  }

  // ─────────────── internals ───────────────

  private drain(): Promise<boolean> {
    if (this.chain) return this.chain;
    const run = this.loop();
    // The loop clears `chain` in its own `finally`; only keep the promise if it is still running.
    if (this.running) this.chain = run;
    return run;
  }

  private async loop(): Promise<boolean> {
    this.running = true;
    try {
      for (;;) {
        if (!this.ready) return false;
        const patch = diffProfileDraft(this.lastSaved, this.current);
        if (isPatchEmpty(patch)) {
          this.attempt = 0;
          if (this.status !== "idle") this.setStatus("saved");
          return true;
        }

        if (this.status !== "error") this.setStatus("saving");
        let result: SaveResult;
        try {
          result = await this.save(patch);
        } catch {
          result = { persisted: { profile: {}, modes: {} }, failed: true };
        }

        this.lastSaved = applyPatch(this.lastSaved, result.persisted);
        if (this.disposed) return !result.failed;

        if (result.failed) {
          this.attempt += 1;
          this.setStatus("error");
          this.clearRetry();
          this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            void this.drain();
          }, retryDelayMs(this.attempt));
          return false;
        }
        // Success: loop again — edits made while this write was in flight are picked up here.
      }
    } finally {
      this.running = false;
      this.chain = null;
    }
  }

  private setStatus(next: AutosaveStatus): void {
    if (this.status === next || this.disposed) return;
    this.status = next;
    this.onStatus(next);
  }

  private clearDebounce(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private clearTimers(): void {
    this.clearDebounce();
    this.clearRetry();
  }
}
