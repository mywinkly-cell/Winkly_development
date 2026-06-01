/**
 * Update the signed-in user's coarse location for geo-based discovery.
 *
 * Privacy: coordinates are refreshed *on app open* (throttled), never streamed
 * continuously. Coordinates are sent to the `set_my_location` RPC, which
 * QUANTIZES them server-side (snaps to a coarse grid based on the user's chosen
 * precision) before storing — raw GPS is never persisted. Stored points are
 * owner-only; other users only ever receive rounded distances.
 */

import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";

const KEY_LAST_UPDATE = "winkly_location_last_update";
const KEY_PERMISSION_ASKED = "winkly_location_permission_asked";

/**
 * Discovery location precision.
 *  - "approximate": ~1.1 km grid (default; GDPR-friendly neighbourhood level).
 *  - "precise":     ~110 m grid (still never the raw GPS point).
 */
export type LocationPrecision = "precise" | "approximate";

/** Minimum time between background refreshes (6h). */
const MIN_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type UpdateLocationResult =
  | { ok: true }
  | { ok: false; reason: "throttled" | "denied" | "error"; message?: string };

/**
 * Refresh the user's stored location.
 *
 * @param opts.force        Skip the throttle (e.g. user tapped "Use my location").
 * @param opts.promptIfNeeded If false, only updates when permission is already
 *                            granted (won't show the OS prompt). Defaults true.
 */
export async function updateMyLocationOnAppOpen(opts?: {
  force?: boolean;
  promptIfNeeded?: boolean;
}): Promise<UpdateLocationResult> {
  const force = opts?.force ?? false;
  const promptIfNeeded = opts?.promptIfNeeded ?? true;

  try {
    if (!force) {
      const last = await AsyncStorage.getItem(KEY_LAST_UPDATE);
      if (last && Date.now() - Number(last) < MIN_REFRESH_INTERVAL_MS) {
        return { ok: false, reason: "throttled" };
      }
    }

    const current = await Location.getForegroundPermissionsAsync();
    let granted = current.status === "granted";

    if (!granted) {
      // Only prompt once unless explicitly forced, and only when allowed to.
      const alreadyAsked = await AsyncStorage.getItem(KEY_PERMISSION_ASKED);
      const canRequest = current.canAskAgain !== false;
      if (!promptIfNeeded || (alreadyAsked && !force) || !canRequest) {
        return { ok: false, reason: "denied" };
      }
      await AsyncStorage.setItem(KEY_PERMISSION_ASKED, "1");
      const req = await Location.requestForegroundPermissionsAsync();
      granted = req.status === "granted";
    }

    if (!granted) {
      return { ok: false, reason: "denied" };
    }

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const { error } = await supabase.rpc("set_my_location", {
      p_lat: pos.coords.latitude,
      p_lng: pos.coords.longitude,
    });
    if (error) {
      return { ok: false, reason: "error", message: error.message };
    }

    await AsyncStorage.setItem(KEY_LAST_UPDATE, String(Date.now()));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "error", message: (e as Error).message };
  }
}

/**
 * Read the user's stored discovery location precision. Defaults to
 * "approximate" if not set or on error.
 */
export async function getLocationPrecision(): Promise<LocationPrecision> {
  try {
    const { data, error } = await supabase.rpc("get_my_location_precision");
    if (error || (data !== "precise" && data !== "approximate")) {
      return "approximate";
    }
    return data as LocationPrecision;
  } catch {
    return "approximate";
  }
}

/**
 * Update the user's discovery location precision. Coarsening (precise →
 * approximate) re-snaps any stored point immediately; switching to "precise"
 * takes effect on the next location refresh. Returns the applied precision.
 */
export async function setLocationPrecision(
  precision: LocationPrecision
): Promise<{ ok: true; precision: LocationPrecision } | { ok: false; message?: string }> {
  try {
    const { data, error } = await supabase.rpc("set_my_location_precision", {
      p_precision: precision,
    });
    if (error) {
      return { ok: false, message: error.message };
    }
    const applied = data === "precise" || data === "approximate" ? (data as LocationPrecision) : precision;
    return { ok: true, precision: applied };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
