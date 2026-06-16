// apps/mobile/lib/auth/secureSessionStorage.ts
//
// Encrypted-at-rest storage adapter for the Supabase auth session.
//
// Why: the Supabase session holds the access + refresh tokens. A refresh token
// is a long-lived bearer credential — anyone who reads it can impersonate the
// user until it is revoked. AsyncStorage persists to plaintext on disk, which is
// readable on a rooted/jailbroken device, via some OEM cloud backups, and by
// device-level malware. expo-secure-store keeps values in the iOS Keychain /
// Android Keystore (hardware-backed where available) instead.
//
// expo-secure-store enforces a ~2048-byte limit per value on Android, and a
// Supabase session (tokens + user object) routinely exceeds that, so we transparently
// chunk values across multiple keyed entries and reassemble on read.
//
// Wired into the Supabase client via the `auth.storage` option in lib/supabase.ts.

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

// Conservatively under the 2048-byte Android limit. Supabase sessions are
// ASCII-dominated (JWTs), so 1 char ≈ 1 byte here.
const CHUNK_SIZE = 1800;
const COUNT_SUFFIX = "__n";

// SecureStore keys must match [A-Za-z0-9._-]. Supabase's key (e.g.
// "sb-<ref>-auth-token") is already valid, but sanitize defensively.
function sanitize(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, "_");
}

// On web (Expo web / tests) SecureStore is unavailable; fall back to AsyncStorage.
const useSecureStore = Platform.OS === "ios" || Platform.OS === "android";

async function getChunkCount(baseKey: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(`${baseKey}${COUNT_SUFFIX}`);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function setItem(key: string, value: string): Promise<void> {
  if (!useSecureStore) {
    await AsyncStorage.setItem(key, value);
    return;
  }
  const baseKey = sanitize(key);
  try {
    // Clear any previous chunks first so a shorter new value can't leave a stale tail.
    await removeItem(key);
    const chunkCount = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
    for (let i = 0; i < chunkCount; i++) {
      await SecureStore.setItemAsync(`${baseKey}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(`${baseKey}${COUNT_SUFFIX}`, String(chunkCount));
  } catch {
    // Best-effort fallback: keep auth working even if SecureStore is unavailable
    // on this device (some Android emulators / locked-down OEMs).
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      // give up silently — Supabase will treat the session as unpersisted
    }
  }
}

async function getItem(key: string): Promise<string | null> {
  if (!useSecureStore) {
    return AsyncStorage.getItem(key);
  }
  const baseKey = sanitize(key);
  try {
    const count = await getChunkCount(baseKey);
    if (count === 0) {
      // One-time migration: adopt a legacy plaintext AsyncStorage session (from
      // before this adapter) so existing users are not silently logged out, then
      // move it into SecureStore.
      const legacy = await AsyncStorage.getItem(key);
      if (legacy != null) {
        await setItem(key, legacy);
        await AsyncStorage.removeItem(key);
        return legacy;
      }
      return null;
    }
    let out = "";
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${baseKey}.${i}`);
      if (part == null) return null; // partial/corrupt write → treat as no session
      out += part;
    }
    return out;
  } catch {
    return null;
  }
}

async function removeItem(key: string): Promise<void> {
  if (!useSecureStore) {
    await AsyncStorage.removeItem(key);
    return;
  }
  const baseKey = sanitize(key);
  try {
    const count = await getChunkCount(baseKey);
    for (let i = 0; i < count; i++) {
      await SecureStore.deleteItemAsync(`${baseKey}.${i}`);
    }
    await SecureStore.deleteItemAsync(`${baseKey}${COUNT_SUFFIX}`);
  } catch {
    // ignore
  }
  // Also clear any legacy plaintext copy left in AsyncStorage.
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const secureSessionStorage = { getItem, setItem, removeItem };
