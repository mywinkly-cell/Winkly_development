import { Alert } from "react-native";
import { t } from "i18next";
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


export function confirmRemoveConnection(params: {
  mode: AppMode;
  firstName: string;
  onConfirm: () => void | Promise<void>;
}) {
  const romance = params.mode === "romance";
  const title = romance ? t("alerts.removeConnection.unmatch") : t("alerts.removeConnection.remove");
  Alert.alert(
    title,
    romance
      ? t("alerts.removeConnection.unmatchMessage", { name: params.firstName })
      : t("alerts.removeConnection.removeMessage", { name: params.firstName }),
    [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: title,
        style: "destructive",
        onPress: () => void params.onConfirm(),
      },
    ]
  );
}
