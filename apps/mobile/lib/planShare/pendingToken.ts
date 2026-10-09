// apps/mobile/lib/planShare/pendingToken.ts
// A plan link opened in the app before the user is signed in (or before the app finished
// starting) is parked here; PlanShareSync joins the plan once there's a session.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { isPlanShareToken } from "@/lib/planShare/links";

const KEY = "winkly_pending_plan_share_token";

type Listener = (token: string | null) => void;
const listeners = new Set<Listener>();
let memory: string | null = null;

export function subscribePendingPlanShareToken(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function setPendingPlanShareToken(token: string): Promise<void> {
  if (!isPlanShareToken(token)) return;
  memory = token;
  listeners.forEach((l) => l(token));
  try {
    await AsyncStorage.setItem(KEY, token);
  } catch {
    // in-memory copy still works for this app session
  }
}

export async function getPendingPlanShareToken(): Promise<string | null> {
  if (memory) return memory;
  try {
    const stored = await AsyncStorage.getItem(KEY);
    return isPlanShareToken(stored) ? stored : null;
  } catch {
    return null;
  }
}

export async function clearPendingPlanShareToken(): Promise<void> {
  memory = null;
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
