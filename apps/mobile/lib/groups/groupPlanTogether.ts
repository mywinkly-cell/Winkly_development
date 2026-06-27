/**
 * "Plan something for us" — bring group planning forward, before a group/chat exists.
 *
 * The pain of "nobody wants to research and propose" peaks BEFORE a chat exists.
 * This runs the exact same group planning path StrategicHost uses inside a group
 * chat (callWinklyPlan with participant_user_ids + conversation_id → a
 * `pending_plan` CTA rendered by GroupPlanConsensusCard), but kicks it off from a
 * plain people-picker:
 *   pick people → create/ensure the group conversation → draft plan_options →
 *   drop the user straight onto the plan_options selection.
 *
 * No duplicate planning logic: this mirrors `draftPendingPlanFromStructuredOption`
 * in app/(tabs)/chats/chat-view.tsx.
 */

import { supabase } from "@/lib/supabase";
import { ensureGroupConversation } from "@/lib/groups/groupChat";
import { createGroupWithInvites } from "@/lib/groupInvitations";
import { callWinklyPlan } from "@/lib/ai/conciergeClient";
import { sendMessage } from "@/lib/chats/api";
import type { Mode } from "@/types";

/** Group planning only applies to Friends/Business (romance has no groups). */
export type PlanTogetherMode = Extract<Mode, "friends" | "business">;

/**
 * Sane cap on a Plan-Together group, INCLUDING the requester. Matches the groups'
 * default `max_members` (8), so the requester can plan with up to 7 others.
 */
export const MAX_PLAN_TOGETHER_GROUP_SIZE = 8;

/** Majority city among participants; falls back to the first non-empty city. */
function pickMajorityCity(rows: { city: string | null }[]): string | null {
  const cities = rows.map((r) => (r.city ?? "").trim()).filter(Boolean);
  if (cities.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const c of cities) counts[c] = (counts[c] ?? 0) + 1;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? null;
}

/** Auto-name the group from the invitees' first names (e.g. "Plan with Alex & Sam"). */
function buildDefaultGroupName(inviteeRows: { first_name: string | null }[]): string {
  const names = inviteeRows.map((r) => (r.first_name ?? "").trim()).filter(Boolean);
  if (names.length === 0) return "Plan together";
  if (names.length === 1) return `Plan with ${names[0]}`;
  if (names.length === 2) return `Plan with ${names[0]} & ${names[1]}`;
  return `Plan with ${names[0]}, ${names[1]} +${names.length - 2}`;
}

/**
 * Create a group for the picked people and immediately produce AI plan options in
 * the group chat. Returns the conversation id to navigate to — the chat renders
 * the plan_options selection (GroupPlanConsensusCard) on arrival.
 */
export async function planTogetherForPeople(params: {
  mode: PlanTogetherMode;
  /** People to plan with (matches/connections). Requester is added implicitly. */
  inviteeUserIds: string[];
  /** Optional explicit group name; otherwise derived from invitees' names. */
  groupName?: string;
}): Promise<{ conversationId: string; groupId: string }> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) throw new Error("Not signed in");

  const invitees = [...new Set(params.inviteeUserIds)].filter((id) => id && id !== me);
  if (invitees.length < 1) {
    throw new Error("Pick at least one person to plan with.");
  }
  if (invitees.length + 1 > MAX_PLAN_TOGETHER_GROUP_SIZE) {
    throw new Error(
      `You can plan with up to ${MAX_PLAN_TOGETHER_GROUP_SIZE - 1} people at once.`
    );
  }

  const participantIds = [me, ...invitees];

  // One fetch covers both the planning city (majority across the group) and the
  // auto-generated group name (invitees' first names).
  const { data: profs } = await supabase
    .from("user_profiles")
    .select("id, first_name, city")
    .in("id", participantIds);
  const profRows = (profs ?? []) as { id: string; first_name: string | null; city: string | null }[];
  const city = pickMajorityCity(profRows);
  const name =
    params.groupName?.trim() || buildDefaultGroupName(profRows.filter((p) => p.id !== me));

  // Create the group (invitees get pending invitations) and ensure its chat exists.
  const { groupId } = await createGroupWithInvites({
    name,
    mode: params.mode,
    inviteeUserIds: invitees,
  });
  const conversationId = await ensureGroupConversation(groupId);

  // Same winkly_plan path StrategicHost uses, but with explicit participants and
  // NO conversation_id. This is deliberate: invitees are still *pending* (the safe
  // invite flow never auto-adds them), so they aren't conversation_members yet.
  // ai-gateway intersects participant_user_ids with conversation_members when a
  // conversation_id is present — passing it here would collapse the plan to
  // requester-only and drop group_fit_notes. Omitting it makes the gateway use the
  // explicit participants directly, exactly like the Planner's "plan with people
  // before a chat exists" path. The plan_options are still dropped into the group
  // chat below. Default to ~48h out (mirrors chat-view).
  const dt = new Date(Date.now() + 48 * 3600_000);
  dt.setMinutes(0, 0, 0);
  const res = await callWinklyPlan({
    context: {
      mode: params.mode,
      city: city ?? undefined,
      date_from: dt.toISOString(),
      participant_user_ids: participantIds,
    },
  });

  // Drop the plan_options into the chat as a `pending_plan` CTA — rendered by
  // GroupPlanConsensusCard (per-option group_fit_notes + vote & confirm).
  const payload = JSON.stringify({
    type: "pending_plan",
    pending_plan_id: res.pending_plan_id,
    plan_options: res.options,
  });
  await sendMessage(conversationId, me, payload, [], { messageType: "cta" });

  return { conversationId, groupId };
}
