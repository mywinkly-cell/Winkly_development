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
  partner_first_name?: string | null;
  partner_photo_url?: string | null;
};

type PartnerProfileRow = {
  id: string;
  first_name: string | null;
  romance_photos: (string | null)[] | null;
  core_photos: (string | null)[] | null;
  main_photo_url: string | null;
};

function partnerPhotoUrlFromProfile(row: PartnerProfileRow | undefined): string | null {
  if (!row) return null;
  const romance = row.romance_photos?.find((p) => !!p);
  if (romance) return romance;
  const core = row.core_photos?.find((p) => !!p);
  if (core) return core;
  return row.main_photo_url ?? null;
}

export async function listMyDateCheckins(): Promise<DateSafetyCheckin[]> {
  const { data, error } = await supabase
    .from("date_safety_checkins")
    .select("*")
    .order("scheduled_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as DateSafetyCheckin[];
  const partnerIds = [
    ...new Set(rows.map((row) => row.partner_user_id).filter((id): id is string => !!id)),
  ];
  if (!partnerIds.length) return rows;

  const { data: profiles, error: profileError } = await supabase
    .from("public_profile_view")
    .select("id, first_name, romance_photos, core_photos, main_photo_url")
    .in("id", partnerIds);

  if (profileError) {
    console.warn("listMyDateCheckins partner profiles", profileError);
    return rows;
  }

  const profileById = new Map<string, PartnerProfileRow>();
  (profiles ?? []).forEach((row) => {
    profileById.set(row.id as string, row as PartnerProfileRow);
  });

  return rows.map((row) => {
    if (!row.partner_user_id) return row;
    const profile = profileById.get(row.partner_user_id);
    if (!profile) return row;
    return {
      ...row,
      partner_first_name: profile.first_name ?? null,
      partner_photo_url: partnerPhotoUrlFromProfile(profile),
    };
  });
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
