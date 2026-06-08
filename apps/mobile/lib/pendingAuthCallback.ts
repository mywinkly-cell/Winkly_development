// lib/pendingAuthCallback.ts
// Stores auth deep-link URL when terms/cookies are not yet accepted (GDPR gate before setSession).

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_PENDING_AUTH_CALLBACK_URL = "winkly_pending_auth_callback_url";

export async function setPendingAuthCallbackUrl(url: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PENDING_AUTH_CALLBACK_URL, url);
  } catch {
    // ignore
  }
}

export async function getPendingAuthCallbackUrl(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY_PENDING_AUTH_CALLBACK_URL);
  } catch {
    return null;
  }
}

export async function clearPendingAuthCallbackUrl(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_PENDING_AUTH_CALLBACK_URL);
  } catch {
    // ignore
  }
}
