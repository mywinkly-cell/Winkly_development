// apps/mobile/lib/planner/planChanges.ts
// Cancel, move or restore a plan — and warn the others — through the plan-update Edge
// Function, which updates the plan, Google / Outlook calendars, the change history and
// notifies the other people in the plan (push in their language + a card in your chat).
// Also: live weather / traffic alerts for upcoming plans (plan_alerts, from plan-watch-cron).

import { supabase } from "@/lib/supabase";
import { syncMissingPlansToThisPhone } from "@/lib/integrations/plannerCalendars";

export type PlanUpdateAction = "cancel" | "reschedule" | "restore" | "notify";
export type PlanChangeKind = "cancelled" | "cant_make_it" | "rescheduled" | "restored" | "heads_up";

export type PlanUpdateResult =
  | { ok: true; kind: PlanChangeKind; notified: number; startsAt: string; endsAt: string | null }
  | { ok: false; error: string; status?: number };

export async function updatePlan(input: {
  plannerItemId: string;
  action: PlanUpdateAction;
  reason?: string | null;
  startsAt?: string;
  endsAt?: string | null;
}): Promise<PlanUpdateResult> {
  const { data, error } = await supabase.functions.invoke("plan-update", {
    body: {
      planner_item_id: input.plannerItemId,
      action: input.action,
      reason: input.reason?.trim() || undefined,
      starts_at: input.startsAt,
      ends_at: input.endsAt ?? undefined,
    },
  });
  if (error || !data?.ok) {
    const status = (error as { context?: { status?: number } } | null)?.context?.status;
    return { ok: false, error: data?.error ?? error?.message ?? "failed", status };
  }
  // This phone's calendar follows right away (other phones catch up on their next open).
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user?.id) syncMissingPlansToThisPhone(auth.user.id);
  return {
    ok: true,
    kind: data.kind as PlanChangeKind,
    notified: Number(data.notified ?? 0),
    startsAt: String(data.starts_at),
    endsAt: typeof data.ends_at === "string" ? data.ends_at : null,
  };
}

export type PlanChange = {
  id: string;
  kind: PlanChangeKind;
  reason: string | null;
  actorId: string | null;
  actorName: string | null;
  oldStartsAt: string | null;
  newStartsAt: string | null;
  createdAt: string;
};

/** What happened to a plan, newest first (visible to everyone in the plan). */
export async function getPlanChanges(plannerItemId: string): Promise<PlanChange[]> {
  const { data } = await supabase
    .from("plan_changes")
    .select("id, kind, reason, actor_id, old_starts_at, new_starts_at, created_at")
    .eq("planner_item_id", plannerItemId)
    .order("created_at", { ascending: false })
    .limit(20);
  const rows = (data ?? []) as {
    id: string; kind: PlanChangeKind; reason: string | null; actor_id: string | null;
    old_starts_at: string | null; new_starts_at: string | null; created_at: string;
  }[];
  const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x)));
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: profs } = await supabase.from("user_profiles").select("id, first_name").in("id", actorIds);
    for (const p of (profs ?? []) as { id: string; first_name: string | null }[]) {
      if (p.first_name) names.set(p.id, p.first_name);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    reason: r.reason,
    actorId: r.actor_id,
    actorName: r.actor_id ? names.get(r.actor_id) ?? null : null,
    oldStartsAt: r.old_starts_at,
    newStartsAt: r.new_starts_at,
    createdAt: r.created_at,
  }));
}

export type PlanAlert = {
  id: string;
  plannerItemId: string;
  kind: "weather" | "traffic";
  /** weather: rain | heavy_rain | storm | snow | heat | cold ; traffic: delay */
  condition: string;
  severity: number;
  /** weather: at (ISO); traffic: extra_minutes, leave_by (ISO) */
  data: Record<string, unknown>;
  createdAt: string;
};

/** Open (not dismissed) alerts for the user's upcoming plans. */
export async function getOpenPlanAlerts(userId: string): Promise<PlanAlert[]> {
  const { data } = await supabase
    .from("plan_alerts")
    .select("id, planner_item_id, kind, condition, severity, data, created_at")
    .eq("user_id", userId)
    .is("dismissed_at", null)
    .order("severity", { ascending: false })
    .limit(20);
  return ((data ?? []) as {
    id: string; planner_item_id: string; kind: "weather" | "traffic"; condition: string;
    severity: number; data: Record<string, unknown> | null; created_at: string;
  }[]).map((r) => ({
    id: r.id,
    plannerItemId: r.planner_item_id,
    kind: r.kind,
    condition: r.condition,
    severity: r.severity,
    data: r.data ?? {},
    createdAt: r.created_at,
  }));
}

export async function dismissPlanAlert(alertId: string): Promise<void> {
  await supabase.from("plan_alerts").update({ dismissed_at: new Date().toISOString() }).eq("id", alertId);
}
