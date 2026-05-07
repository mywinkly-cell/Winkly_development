// apps/mobile/lib/notifications.ts
// Expo Notifications + Supabase token persistence + typed helpers.

import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { supabase } from "@/lib/supabase";

export type NotificationPermissionStatus = "undetermined" | "denied" | "granted" | "unavailable";

export type WinklyNotificationPayloadKind =
  | "new_match"
  | "chat_message"
  | "planner_invitation"
  | "plan_confirmed";

export type LocalNotificationRequest = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  triggerAt?: Date;
};

export type NotificationsFacade = {
  isAvailable: () => Promise<boolean>;
  getPermissionStatus: () => Promise<NotificationPermissionStatus>;
  requestPermissions: () => Promise<NotificationPermissionStatus>;
  scheduleLocal: (req: LocalNotificationRequest) => Promise<string | null>;
  cancelScheduled: (id: string) => Promise<void>;
};

async function tryImportExpoNotifications() {
  try {
    return await import("expo-notifications");
  } catch {
    return null;
  }
}

function isLikelyEasProjectId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const s = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/** SDK 53+: Android Expo Go does not support remote push; requesting a token spams errors. */
function shouldSkipExpoPushTokenOnAndroidExpoGo(): boolean {
  return Platform.OS === "android" && Constants.appOwnership === "expo";
}

let runtimeInitialized = false;

/** Call once per app boot — foreground presentation defaults. */
export async function initializeNotificationsRuntime(): Promise<void> {
  if (runtimeInitialized) return;
  const mod = await tryImportExpoNotifications();
  if (!mod) return;
  runtimeInitialized = true;
  mod.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export function resetNotificationsRuntime(): void {
  runtimeInitialized = false;
}

export async function ensureAndroidNotificationChannelAsync(): Promise<void> {
  const mod = await tryImportExpoNotifications();
  if (!mod || Platform.OS !== "android") return;
  await mod.setNotificationChannelAsync("default", {
    name: "Default",
    importance: mod.AndroidImportance.MAX,
    vibrationPattern: [0, 250],
    lightColor: "#7C3AED",
  });
}

/**
 * Registers Expo push token (physical device) and upserts into `user_push_tokens`.
 * Does nothing on simulator / web / missing native module.
 */
export async function registerForPushNotificationsAndSync(): Promise<string | null> {
  const mod = await tryImportExpoNotifications();
  if (!mod) return null;

  await initializeNotificationsRuntime();
  await ensureAndroidNotificationChannelAsync();

  if (!Device.isDevice) return null;
  if (shouldSkipExpoPushTokenOnAndroidExpoGo()) return null;

  const { status: existing } = await mod.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await mod.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return null;

  const rawProjectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    Constants.easConfig?.projectId;
  const projectId = isLikelyEasProjectId(rawProjectId) ? rawProjectId.trim() : undefined;
  const tokenRes = await mod.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  const token = tokenRes.data;
  const platform =
    Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "unknown";

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (uid && token) {
    const { error } = await supabase.from("user_push_tokens").upsert(
      {
        user_id: uid,
        expo_push_token: token,
        platform,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,expo_push_token" },
    );
    if (error) console.warn("user_push_tokens upsert:", error.message);
  }

  return token ?? null;
}

export const notifications: NotificationsFacade = {
  async isAvailable() {
    return (await tryImportExpoNotifications()) != null;
  },

  async getPermissionStatus() {
    const mod = await tryImportExpoNotifications();
    if (!mod) return "unavailable";
    const res = await mod.getPermissionsAsync();
    if (res.status === "granted") return "granted";
    if (res.status === "denied") return "denied";
    return "undetermined";
  },

  async requestPermissions() {
    const mod = await tryImportExpoNotifications();
    if (!mod) return "unavailable";
    await initializeNotificationsRuntime();
    const res = await mod.requestPermissionsAsync();
    if (res.status === "granted") return "granted";
    if (res.status === "denied") return "denied";
    return "undetermined";
  },

  async scheduleLocal(req) {
    const mod = await tryImportExpoNotifications();
    if (!mod) return null;

    const content = { title: req.title, body: req.body, data: req.data };
    const trigger = req.triggerAt ? ({ date: req.triggerAt } as unknown) : null;

    return await mod.scheduleNotificationAsync({ content, trigger } as Parameters<
      typeof mod.scheduleNotificationAsync
    >[0]);
  },

  async cancelScheduled(id) {
    const mod = await tryImportExpoNotifications();
    if (!mod) return;
    await mod.cancelScheduledNotificationAsync(id);
  },
};
