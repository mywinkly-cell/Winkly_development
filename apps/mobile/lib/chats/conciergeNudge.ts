/**
 * Proactive concierge nudge — stale DM (Friends/Business) with optional shared-interest copy.
 */

import { supabase } from "@/lib/supabase";

export async function isConversationEligibleForStaleNudge(
  conversationId: string,
  staleHours = 48
): Promise<boolean> {
  const { data, error } = await supabase.rpc("conversation_eligible_for_concierge_nudge", {
    p_conversation_id: conversationId,
    p_stale_hours: staleHours,
  });
  if (error) return false;
  return data === true;
}

export async function dismissStaleConciergeNudge(conversationId: string, snoozeDays = 7): Promise<void> {
  const { error } = await supabase.rpc("dismiss_concierge_nudge", {
    p_conversation_id: conversationId,
    p_snooze_days: snoozeDays,
  });
  if (error) throw error;
}
