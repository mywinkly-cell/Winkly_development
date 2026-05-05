import { supabase } from "@/lib/supabase";

/**
 * Returns a set of user ids that should be excluded from feeds:
 * - users you blocked
 * - users who blocked you
 */
export async function getBlockedUserIdSet(userId: string): Promise<Set<string>> {
  if (!userId) return new Set();

  const [{ data: iBlocked }, { data: blockedMe }] = await Promise.all([
    supabase.from("user_blocks").select("blocked_id").eq("blocker_id", userId),
    supabase.from("user_blocks").select("blocker_id").eq("blocked_id", userId),
  ]);

  const out = new Set<string>();
  for (const r of iBlocked ?? []) out.add((r as { blocked_id: string }).blocked_id);
  for (const r of blockedMe ?? []) out.add((r as { blocker_id: string }).blocker_id);
  return out;
}

