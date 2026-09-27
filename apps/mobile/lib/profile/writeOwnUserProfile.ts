// Create-or-update the signed-in user's own user_profiles row.
//
// Deliberately NOT a PostgREST upsert. `birthday` and `last_name` are owner-only
// columns (left out of the authenticated SELECT grant so other users can't read
// them), and Postgres requires SELECT privilege on every column that
// INSERT … ON CONFLICT DO UPDATE writes, because the update half reads
// EXCLUDED.<column>. An upsert that includes either column is therefore refused
// with "permission denied for table user_profiles" — before Postgres even looks
// for an existing row. A plain UPDATE, then INSERT when there was no row, needs
// no SELECT on them.

import { supabase } from "@/lib/supabase";

type WriteError = { message: string; code?: string } | null;

const UNIQUE_VIOLATION = "23505";

async function updateOwnRow(userId: string, columns: Record<string, unknown>) {
  const { data, error } = await supabase.from("user_profiles").update(columns).eq("id", userId).select("id");
  return { updated: (data?.length ?? 0) > 0, error: (error as WriteError) ?? null };
}

export async function writeOwnUserProfile(
  userId: string,
  columns: Record<string, unknown>
): Promise<{ error: WriteError }> {
  const { id: _ignored, ...rest } = columns;

  const first = await updateOwnRow(userId, rest);
  if (first.error) return { error: first.error };
  if (first.updated) return { error: null };

  const { error: insertError } = await supabase.from("user_profiles").insert({ ...rest, id: userId });
  if (!insertError) return { error: null };

  // Another save created the row between our UPDATE and INSERT — update it instead.
  if ((insertError as WriteError)?.code === UNIQUE_VIOLATION) {
    const retry = await updateOwnRow(userId, rest);
    return { error: retry.error ?? (retry.updated ? null : { message: "user_profiles row not found" }) };
  }
  return { error: insertError as WriteError };
}
