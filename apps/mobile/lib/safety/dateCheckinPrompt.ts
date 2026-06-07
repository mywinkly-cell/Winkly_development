/**
 * One-time date safety check-in prompt after a romance date is confirmed.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const DISMISSED_KEY_PREFIX = "winkly_date_safety_dismissed_";

export type DateSafetyPromptParams = {
  plannerItemId: string;
  partnerUserId?: string | null;
  scheduledAt: string;
};

type DateSafetyPromptListener = (params: DateSafetyPromptParams) => void;

let listener: DateSafetyPromptListener | null = null;

export function subscribeDateSafetyPrompt(fn: DateSafetyPromptListener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

async function wasPromptDismissed(plannerItemId: string): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(`${DISMISSED_KEY_PREFIX}${plannerItemId}`);
    return v === "true";
  } catch {
    return false;
  }
}

export async function markDateSafetyPromptDismissed(plannerItemId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`${DISMISSED_KEY_PREFIX}${plannerItemId}`, "true");
  } catch {
    // ignore
  }
}

/** Show the global date-safety modal once per planner item (unless user dismissed). */
export async function requestDateSafetyPrompt(params: DateSafetyPromptParams): Promise<void> {
  if (await wasPromptDismissed(params.plannerItemId)) return;
  listener?.(params);
}
