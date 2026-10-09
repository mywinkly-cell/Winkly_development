// apps/mobile/lib/planShare/api.ts
// Supabase calls for shareable plan links. The server is the source of truth: RLS keeps
// plan_shares owner-only, RSVP emails are never readable, and joining goes through
// SECURITY DEFINER RPCs (migration 20261009120000_plan_shares_web_rsvp.sql).

import { supabase } from "@/lib/supabase";
import { deviceTimeZone } from "@/lib/planShare/links";

export type PlanShare = {
  id: string;
  token: string;
  expiresAt: string;
  createdAt: string;
  maxUses: number | null;
  useCount: number;
  revokedAt: string | null;
};

export type WebRsvp = {
  id: string;
  firstName: string;
  status: "pending" | "converted";
  createdAt: string;
};

export type AcceptPlanShareStatus =
  | "ok"
  | "own_plan"
  | "full"
  | "expired"
  | "revoked"
  | "unavailable"
  | "not_found"
  | "unauthenticated"
  | "error";

export type AcceptPlanShareResult = {
  status: AcceptPlanShareStatus;
  plannerItemId: string | null;
  alreadyJoined: boolean;
  convertedRsvp: boolean;
};

export type ClaimRsvpsResult = { converted: number; plannerItemIds: string[] };

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function mapPlanShareRow(row: unknown): PlanShare | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = str(r.id);
  const token = str(r.token);
  const expiresAt = str(r.expires_at);
  if (!id || !token || !expiresAt) return null;
  return {
    id,
    token,
    expiresAt,
    createdAt: str(r.created_at) ?? expiresAt,
    maxUses: typeof r.max_uses === "number" ? r.max_uses : null,
    useCount: typeof r.use_count === "number" ? r.use_count : 0,
    revokedAt: str(r.revoked_at),
  };
}

export function mapWebRsvpRow(row: unknown): WebRsvp | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = str(r.id);
  const firstName = str(r.first_name);
  if (!id || !firstName) return null;
  return {
    id,
    firstName,
    status: r.status === "converted" ? "converted" : "pending",
    createdAt: str(r.created_at) ?? "",
  };
}

const ACCEPT_STATUSES: readonly AcceptPlanShareStatus[] = [
  "ok", "own_plan", "full", "expired", "revoked", "unavailable", "not_found", "unauthenticated",
];

export function mapAcceptResult(data: unknown): AcceptPlanShareResult {
  const r = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const status = ACCEPT_STATUSES.includes(r.status as AcceptPlanShareStatus)
    ? (r.status as AcceptPlanShareStatus)
    : "error";
  return {
    status,
    plannerItemId: str(r.planner_item_id),
    alreadyJoined: r.already_joined === true,
    convertedRsvp: r.converted_rsvp === true,
  };
}

export function mapClaimResult(data: unknown): ClaimRsvpsResult {
  const r = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const ids = Array.isArray(r.planner_item_ids) ? r.planner_item_ids.filter((x): x is string => typeof x === "string") : [];
  const converted = typeof r.converted === "number" ? r.converted : ids.length;
  return { converted, plannerItemIds: ids };
}

/** Is this link still usable right now? */
export function isPlanShareActive(share: PlanShare, now: Date = new Date()): boolean {
  if (share.revokedAt) return false;
  if (new Date(share.expiresAt).getTime() <= now.getTime()) return false;
  return share.maxUses === null || share.useCount < share.maxUses;
}

/** Creates a 7-day link for a plan the caller created — or returns the one that's still active. */
export async function createPlanShare(plannerItemId: string): Promise<PlanShare> {
  const { data, error } = await supabase.rpc("create_plan_share", {
    p_planner_item_id: plannerItemId,
    p_time_zone: deviceTimeZone(),
  });
  if (error) throw error;
  const share = mapPlanShareRow(Array.isArray(data) ? data[0] : data);
  if (!share) throw new Error("create_plan_share returned no link");
  return share;
}

export async function getActivePlanShare(plannerItemId: string): Promise<PlanShare | null> {
  const { data, error } = await supabase
    .from("plan_shares")
    .select("id, token, expires_at, created_at, max_uses, use_count, revoked_at")
    .eq("planner_item_id", plannerItemId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  const share = mapPlanShareRow(data[0]);
  return share && isPlanShareActive(share) ? share : null;
}

export async function revokePlanShare(shareId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("revoke_plan_share", { p_share_id: shareId });
  if (error) throw error;
  return data === true;
}

/** Who said "I'm in" from the web page (host only; first names, never emails). */
export async function listWebRsvps(plannerItemId: string): Promise<WebRsvp[]> {
  const { data, error } = await supabase
    .from("plan_share_rsvps")
    .select("id, first_name, status, created_at")
    .eq("planner_item_id", plannerItemId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map(mapWebRsvpRow).filter((r): r is WebRsvp => r !== null);
}

/** Invitee opened the link in the app → becomes a normal participant. */
export async function acceptPlanShare(token: string): Promise<AcceptPlanShareResult> {
  const { data, error } = await supabase.rpc("accept_plan_share", { p_token: token });
  if (error) return { status: "error", plannerItemId: null, alreadyJoined: false, convertedRsvp: false };
  return mapAcceptResult(data);
}

/** After sign-up: web RSVPs given with this (confirmed) email become planner participations. */
export async function claimPlanShareRsvps(): Promise<ClaimRsvpsResult> {
  const { data, error } = await supabase.rpc("claim_plan_share_rsvps");
  if (error) return { converted: 0, plannerItemIds: [] };
  return mapClaimResult(data);
}
