// apps/mobile/app/lib/session.ts

import AsyncStorage from "@react-native-async-storage/async-storage";

const SESSION_KEY = "winkly_session";

export type WinklySession = {
  userId: string;
  email?: string;
  verified?: boolean;
  accountType?: "personal" | "business";
  [key: string]: any;
};

export async function getSession(): Promise<WinklySession | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setSession(session: WinklySession): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function setVerified(verified: boolean): Promise<void> {
  const existing = await getSession();
  if (!existing) return;
  const updated: WinklySession = { ...existing, verified };
  await setSession(updated);
}
