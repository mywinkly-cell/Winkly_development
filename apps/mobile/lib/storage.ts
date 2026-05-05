// apps/mobile/lib/storage.ts
// Storage abstraction (AsyncStorage + SecureStore) with typed helpers.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

export type StorageNamespace = "app" | "auth" | "cache" | "flags";

function keyFor(ns: StorageNamespace, key: string) {
  return `winkly:${ns}:${key}`;
}

export const storage = {
  async getItem(ns: StorageNamespace, key: string): Promise<string | null> {
    return await AsyncStorage.getItem(keyFor(ns, key));
  },

  async setItem(ns: StorageNamespace, key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(keyFor(ns, key), value);
  },

  async removeItem(ns: StorageNamespace, key: string): Promise<void> {
    await AsyncStorage.removeItem(keyFor(ns, key));
  },

  async getJSON<T>(ns: StorageNamespace, key: string): Promise<T | null> {
    const raw = await AsyncStorage.getItem(keyFor(ns, key));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  async setJSON<T>(ns: StorageNamespace, key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(keyFor(ns, key), JSON.stringify(value));
  },

  async mergeJSON<T extends Record<string, unknown>>(ns: StorageNamespace, key: string, patch: Partial<T>): Promise<T> {
    const existing = (await storage.getJSON<T>(ns, key)) ?? ({} as T);
    const merged = { ...existing, ...patch } as T;
    await storage.setJSON(ns, key, merged);
    return merged;
  },
};

export const secureStorage = {
  /**
   * SecureStore is best-effort on Android emulators and some OEM devices.
   * We keep it separate from AsyncStorage so call sites can decide on fallback.
   */
  async getItem(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(keyFor("auth", key));
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(keyFor("auth", key), value);
    } catch {
      // Swallow: treat secure storage failures as non-fatal.
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(keyFor("auth", key));
    } catch {
      // Swallow
    }
  },
};

