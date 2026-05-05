import { supabase } from "@/lib/supabase";

export type DateCheckinStatus = "scheduled" | "ok" | "needs_help" | "missed" | "cancelled";

export type DateSafetyCheckin = {
  id: string;
  user_id: string;
  partner_user_id: string | null;
  planner_item_id: string | null;
  status: DateCheckinStatus;
  scheduled_at: string;
  checkin_due_at: string | null;
  responded_at: string | null;
  notes: string | null;
};

export async function listMyDateCheckins(): Promise<DateSafetyCheckin[]> {
  const { data, error } = await supabase
    .from("date_safety_checkins")
    .select("*")
    .order("scheduled_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DateSafetyCheckin[];
}

export async function createDateCheckin(params: {
  partnerUserId?: string | null;
  plannerItemId?: string | null;
  scheduledAt: Date;
  checkinDueAt?: Date | null;
}): Promise<DateSafetyCheckin> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const due = params.checkinDueAt ?? new Date(params.scheduledAt.getTime() + 60 * 60 * 1000);
  const { data, error } = await supabase
    .from("date_safety_checkins")
    .insert({
      user_id: uid,
      partner_user_id: params.partnerUserId ?? null,
      planner_item_id: params.plannerItemId ?? null,
      status: "scheduled",
      scheduled_at: params.scheduledAt.toISOString(),
      checkin_due_at: due.toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as DateSafetyCheckin;
}

export async function respondDateCheckin(
  id: string,
  status: "ok" | "needs_help"
): Promise<void> {
  const { error } = await supabase
    .from("date_safety_checkins")
    .update({
      status,
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}
