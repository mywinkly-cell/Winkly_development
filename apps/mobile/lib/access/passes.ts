import { supabase } from "@/lib/supabase";
import type { AppMode } from "@/lib/chats/types";

export async function passUser(userId: string, targetUserId: string, mode: AppMode) {
  if (!userId) throw new Error("Not signed in");
  if (!targetUserId) return;

  const { error } = await supabase.from("user_passes").upsert(
    {
      passer_id: userId,
      passed_id: targetUserId,
      mode,
    },
    { onConflict: "passer_id,passed_id,mode" }
  );
  if (error) throw error;
}

export async function getPassedUserIdSet(userId: string, mode: AppMode): Promise<Set<string>> {
  if (!userId) return new Set();
  const { data, error } = await supabase
    .from("user_passes")
    .select("passed_id")
    .eq("passer_id", userId)
    .eq("mode", mode);
  if (error) throw error;
  return new Set((data ?? []).map((r) => (r as { passed_id: string }).passed_id));
}

