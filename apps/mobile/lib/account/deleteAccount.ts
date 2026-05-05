// Winkly — Request permanent account deletion (calls delete-account Edge Function)
// On success, auth user and all related data (profiles, messages, planner, ai_requests, storage) are removed.

import { supabase } from "@/lib/supabase";

export type DeleteAccountResult = { ok: true } | { error: string };

export async function requestAccountDeletion(): Promise<DeleteAccountResult> {
  const { data, error } = await supabase.functions.invoke("delete-account", {
    method: "POST",
    body: {},
  });
  if (error) {
    return { error: error.message ?? "Deletion request failed" };
  }
  const body = data as { ok?: boolean; error?: string } | null;
  if (body?.error) return { error: body.error };
  if (body?.ok) return { ok: true };
  return { error: "Unexpected response" };
}
