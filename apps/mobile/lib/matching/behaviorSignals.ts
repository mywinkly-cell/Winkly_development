import { supabase } from "@/lib/supabase";
import type { Mode } from "@/types";

export type PairBehaviorSignalKind =
  | "dm_first_outreach"
  | "concierge_match_session"
  | "planner_from_chat"
  | "invite_accepted";

/**
 * Structured pair signals (Beyond raw message counts — concierge, planner-from-chat, invites).
 * Server merges into behavior_pair_signals.interaction_signals and refreshes affinity_score.
 */
export async function recordPairBehaviorSignal(params: {
  partnerUserId: string;
  mode: Extract<Mode, "romance" | "friends" | "business">;
  kind: PairBehaviorSignalKind;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { error } = await supabase.rpc("record_pair_behavior_signal", {
      p_partner_user_id: params.partnerUserId,
      p_mode: params.mode,
      p_kind: params.kind,
      p_payload: params.payload ?? {},
    });
    if (error) console.warn("record_pair_behavior_signal:", error.message);
  } catch (e) {
    console.warn("record_pair_behavior_signal:", e);
  }
}
