// apps/mobile/lib/legalFlags.ts
// Persistent storage for Terms & Conditions and Cookie consent
// Used on first app use and gate for sign-in/sign-up until accepted

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_TERMS_COOKIES_ACCEPTED = "winkly_terms_and_cookies_accepted";

export async function getTermsAndCookiesAccepted(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEY_TERMS_COOKIES_ACCEPTED);
    return v === "true";
  } catch {
    return false;
  }
}

export async function setTermsAndCookiesAccepted(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_TERMS_COOKIES_ACCEPTED, "true");
  } catch {
    // ignore
  }
}

/** Clear acceptance (e.g. for testing or account deletion flow). */
export async function clearTermsAndCookiesAccepted(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_TERMS_COOKIES_ACCEPTED);
  } catch {
    // ignore
  }
}
