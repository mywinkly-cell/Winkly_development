import { supabase } from "@/lib/supabase";

export type WinklyRemotePushKind = "new_match" | "chat_message" | "planner_invitation" | "planner_response";

/** Ask Edge Function to deliver an Expo push to a peer (server verifies relationship). */
export async function requestPeerPushNotification(params: {
  kind: WinklyRemotePushKind;
  recipientUserId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  conversationId?: string;
  plannerInvitationId?: string;
}): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("expo-push-notify", {
      body: {
        kind: params.kind,
        recipient_user_id: params.recipientUserId,
        title: params.title,
        body: params.body,
        data: params.data ?? {},
        conversation_id: params.conversationId,
        planner_invitation_id: params.plannerInvitationId,
      },
    });
    if (error) console.warn("requestPeerPushNotification:", error.message);
  } catch (e) {
    console.warn("requestPeerPushNotification:", e);
  }
}
