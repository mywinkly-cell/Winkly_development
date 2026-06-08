import { Alert } from "react-native";
import type { InviteFormValues } from "@/components/chats/InviteToPlanModal";
import { createDirectChat, sendMessage } from "@/lib/chats";
import { createPlannerInvite } from "@/lib/plannerInvitations";
import type { Mode } from "@/types";

export const PROFILE_INVITE_LABEL: Record<Mode, string> = {
  romance: "Invite on date",
  friends: "Invite to meet-up",
  business: "Suggest meeting",
  events: "Invite to meet",
};

const CONNECT_FIRST_MESSAGE: Record<Mode, string> = {
  romance: "Match with them first to send a date invite.",
  friends: "Connect as friends first to send a meet-up invite.",
  business: "Connect first to suggest a meeting.",
  events: "Connect first to send an invite.",
};

export function promptConnectBeforeInvite(mode: Mode) {
  Alert.alert("Connect first", CONNECT_FIRST_MESSAGE[mode]);
}

type SubmitProfilePlannerInviteParams = {
  meId: string;
  targetUserId: string;
  mode: Mode;
  chatId: string | null;
  isConnected: boolean;
  values: InviteFormValues;
};

export async function submitProfilePlannerInvite({
  meId,
  targetUserId,
  mode,
  chatId,
  isConnected,
  values,
}: SubmitProfilePlannerInviteParams): Promise<{ conversationId: string }> {
  if (!isConnected) {
    promptConnectBeforeInvite(mode);
    throw new Error("Not connected");
  }

  const conversationId =
    chatId ?? (await createDirectChat(targetUserId, mode, mode === "romance" ? "match" : "connection", meId));

  const title = values.place.trim() ? `${values.activity} at ${values.place.trim()}` : values.activity;
  const startsAtIso = values.starts_at.toISOString();
  const { planner_item_id, planner_invitation_id } = await createPlannerInvite(meId, targetUserId, conversationId, {
    title,
    source_mode: mode,
    starts_at: startsAtIso,
    ends_at: values.ends_at ? values.ends_at.toISOString() : undefined,
    activity: values.activity,
    location: values.location || undefined,
    place: values.place || undefined,
  });

  const ctaPayload = JSON.stringify({
    type: "planner_invite",
    planner_item_id,
    planner_invitation_id,
    title,
    activity: values.activity,
    location: values.location || null,
    place: values.place || null,
    starts_at: startsAtIso,
    ends_at: values.ends_at ? values.ends_at.toISOString() : null,
    source_mode: mode,
  });

  await sendMessage(conversationId, meId, ctaPayload, [], { messageType: "cta" });

  return { conversationId };
}
