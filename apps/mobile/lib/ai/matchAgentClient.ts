// Match Agent — ai-gateway task `match_agent`: Places + weather + LLM draft; persisted in `ai_match_agent_proposals`.

import { supabase } from "@/lib/supabase";
import { sendMessage } from "@/lib/chats/api";
import type { Message } from "@/lib/chats/types";
import { callConcierge, type ConciergeResponse } from "@/lib/ai/conciergeClient";

export async function runMatchAgentForChat(params: {
  mode: "romance" | "friends";
  partnerUserId: string;
  conversationId: string;
  activityHint?: string;
  targetSlotIso?: string;
  searchRadiusMiles?: number;
}): Promise<ConciergeResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) return { message: "", error: "Not signed in" };

  const { data: core } = await supabase.from("profiles_core").select("city").eq("id", uid).maybeSingle();
  const city = (core as { city?: string } | null)?.city ?? undefined;

  return callConcierge({
    task: "match_agent",
    context: {
      mode: params.mode,
      partner_user_id: params.partnerUserId,
      conversation_id: params.conversationId,
      city,
      activity_hint: params.activityHint,
      target_slot_iso: params.targetSlotIso,
      search_radius_miles: params.searchRadiusMiles,
      source_screen: "chats",
      origin_context: `Chat_1:1_${params.mode === "romance" ? "Romance" : "Friends"}_MatchAgent`,
    },
  });
}

export type MatchAgentCtaPayload = {
  type: "match_agent";
  proposal_id: string | null;
  agent_message: string;
  draft: Record<string, unknown> | null;
  created_by: string;
  partner_user_id: string;
  privacy?: Record<string, unknown>;
};

/**
 * Calls the gateway and posts a CTA bubble in the thread (draft + double opt-in in DB when proposal_id present).
 */
export async function postMatchAgentCtaMessage(params: {
  conversationId: string;
  partnerUserId: string;
  createdByUserId: string;
  mode: "romance" | "friends";
}): Promise<{ ok: true; inserted: Message } | { ok: false; error: string }> {
  const res = await runMatchAgentForChat({
    mode: params.mode,
    partnerUserId: params.partnerUserId,
    conversationId: params.conversationId,
  });
  if (res.error) return { ok: false, error: res.error };

  const msg =
    (typeof res.message === "string" && res.message.trim()) ||
    (typeof res.match_agent?.agent_message === "string" && res.match_agent.agent_message.trim()) ||
    "";
  if (!msg) return { ok: false, error: "No suggestion returned" };

  const ma = res.match_agent;
  const payload: MatchAgentCtaPayload = {
    type: "match_agent",
    proposal_id: ma?.proposal_id ?? null,
    agent_message: msg,
    draft: ma?.draft ? (ma.draft as Record<string, unknown>) : null,
    created_by: params.createdByUserId,
    partner_user_id: params.partnerUserId,
    privacy: ma?.privacy,
  };

  const inserted = await sendMessage(params.conversationId, params.createdByUserId, JSON.stringify(payload), [], {
    messageType: "cta",
  });
  return { ok: true, inserted };
}

export type MatchAgentApprovalStage = "primary_set" | "partner_set" | "confirmed";

/**
 * Double opt-in: first approver sets their timestamp; when both match participants have approved, status becomes `confirmed`.
 */
export async function recordMatchAgentApproval(
  proposalId: string
): Promise<{ ok: true; stage: MatchAgentApprovalStage } | { ok: false; error: string }> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: row, error: fetchErr } = await supabase
    .from("ai_match_agent_proposals")
    .select("created_by, partner_user_id, primary_approved_at, partner_approved_at")
    .eq("id", proposalId)
    .maybeSingle();

  if (fetchErr || !row) return { ok: false, error: "Proposal not found" };

  const isPrimary = user.id === row.created_by;
  const isPartner = user.id === row.partner_user_id;
  if (!isPrimary && !isPartner) return { ok: false, error: "Not allowed" };

  if (row.primary_approved_at && row.partner_approved_at) {
    return { ok: false, error: "ALREADY_FULLY_CONFIRMED" };
  }
  if (isPrimary && row.primary_approved_at) return { ok: false, error: "ALREADY_APPROVED" };
  if (isPartner && row.partner_approved_at) return { ok: false, error: "ALREADY_APPROVED" };

  const now = new Date().toISOString();

  if (isPrimary && !row.primary_approved_at) {
    const partnerFirst = !!row.partner_approved_at;
    const { error } = await supabase
      .from("ai_match_agent_proposals")
      .update({
        primary_approved_at: now,
        status: partnerFirst ? "confirmed" : "awaiting_partner",
        updated_at: now,
      })
      .eq("id", proposalId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, stage: partnerFirst ? "confirmed" : "primary_set" };
  }

  if (isPartner && !row.partner_approved_at) {
    const primaryFirst = !!row.primary_approved_at;
    const { error } = await supabase
      .from("ai_match_agent_proposals")
      .update({
        partner_approved_at: now,
        status: primaryFirst ? "confirmed" : "awaiting_primary",
        updated_at: now,
      })
      .eq("id", proposalId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, stage: primaryFirst ? "confirmed" : "partner_set" };
  }

  return { ok: false, error: "Already confirmed" };
}

