// apps/mobile/components/NotificationDeepLinkHandler.tsx
// Routes the user to the right screen when they tap a push notification
// (foreground, background, or cold start). Renders nothing.

import { useEffect } from "react";
import { useRouter } from "expo-router";
import { Routes } from "@/constants/routes";
import { addNotificationResponseListener, getInitialNotificationData } from "@/lib/notifications";

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Map a notification data payload to an in-app route, or null if none applies. */
function routeForNotification(data: Record<string, unknown>): string | null {
  const kind = str(data.winkly_kind) ?? str(data.kind);
  const conversationId = str(data.conversation_id);
  const chatId = str(data.chat_id);

  if (kind === "chat_message" && conversationId) return Routes.chatById(conversationId);
  if (kind === "new_match") return chatId ? Routes.chatById(chatId) : Routes.modeRomanceMatches;
  if (kind === "planner_invitation" || kind === "planner_response" || kind === "plan_confirmed") {
    return Routes.plannerInvitations;
  }
  // Fallback: any payload that names a conversation opens that thread.
  if (conversationId) return Routes.chatById(conversationId);
  if (chatId) return Routes.chatById(chatId);
  return null;
}

export function NotificationDeepLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    const navigate = (data: Record<string, unknown>) => {
      const route = routeForNotification(data);
      if (route) router.push(route as Parameters<typeof router.push>[0]);
    };

    // Cold start: app was launched by tapping a notification.
    getInitialNotificationData().then((data) => {
      if (!cancelled && data) navigate(data);
    });

    // Foreground / background taps.
    addNotificationResponseListener(navigate).then((unsub) => {
      if (cancelled) unsub();
      else unsubscribe = unsub;
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [router]);

  return null;
}
