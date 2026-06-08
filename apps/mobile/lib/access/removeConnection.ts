import { Alert } from "react-native";
import { supabase } from "@/lib/supabase";
import type { AppMode } from "@/lib/chats/types";

export async function removeModeConnection(otherUserId: string, mode: AppMode): Promise<void> {
  const { data, error } = await supabase.rpc("remove_mode_connection", {
    p_other_user_id: otherUserId,
    p_mode: mode,
  });
  if (error) throw error;
  const row = data as { ok?: boolean; error?: string };
  if (!row?.ok) throw new Error(row?.error ?? "Could not remove connection");
}

function removeTitle(mode: AppMode) {
  return mode === "romance" ? "Unmatch" : "Remove contact";
}

export function confirmRemoveConnection(params: {
  mode: AppMode;
  firstName: string;
  onConfirm: () => void | Promise<void>;
}) {
  const title = removeTitle(params.mode);
  Alert.alert(
    title,
    `If you ${title.toLowerCase()} ${params.firstName}:\n\n• Your chat will be removed for both of you\n• You won't see each other in Discover or Home again\n• This does not block them`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: title,
        style: "destructive",
        onPress: () => void params.onConfirm(),
      },
    ]
  );
}
