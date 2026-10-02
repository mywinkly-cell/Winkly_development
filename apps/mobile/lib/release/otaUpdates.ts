// apps/mobile/lib/release/otaUpdates.ts
// Background EAS Update check. app.config.js keeps checkAutomatically: ON_ERROR_RECOVERY so a slow
// or unreachable update server never blocks launch (docs/RUNBOOK.md §6); this downloads new JS
// after the app is already running instead, and expo-updates applies it on the next cold start.

import * as Updates from "expo-updates";
import { addBreadcrumb } from "@/lib/monitoring/sentry";

const MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;
let lastCheckAt = 0;
let inFlight = false;

export async function checkForOtaUpdateInBackground(): Promise<void> {
  if (__DEV__ || !Updates.isEnabled || inFlight) return;
  const now = Date.now();
  if (now - lastCheckAt < MIN_INTERVAL_MS) return;
  inFlight = true;
  lastCheckAt = now;
  try {
    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable) {
      await Updates.fetchUpdateAsync();
      addBreadcrumb("ota.update_downloaded");
    }
  } catch (error) {
    // Offline or update server down: the embedded/cached bundle keeps running; retry next interval.
    addBreadcrumb("ota.check_failed", { message: error instanceof Error ? error.message : String(error) });
  } finally {
    inFlight = false;
  }
}
