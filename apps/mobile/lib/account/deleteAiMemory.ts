// Winkly — Delete AI memory (without deleting account)
import { supabase } from "@/lib/supabase";
import type { Mode } from "@/types";

export type DeleteAiMemoryScope = Mode | "all";

export type DeleteAiMemoryResult =
  | { ok: true; deleted?: Record<string, unknown> }
  | { error: string };

export async function requestDeleteAiMemory(params: {
  scope: DeleteAiMemoryScope;
  deleteConciergeSignals?: boolean;
}): Promise<DeleteAiMemoryResult> {
  const { scope, deleteConciergeSignals } = params;
  const { data, error } = await supabase.functions.invoke("delete-ai-memory", {
    method: "POST",
    body: {
      mode: scope,
      delete_concierge_signals: deleteConciergeSignals === true,
    },
  });
  if (error) return { error: error.message ?? "Delete AI memory failed" };
  const body = data as { ok?: boolean; error?: string; deleted?: Record<string, unknown> } | null;
  if (body?.error) return { error: body.error };
  if (body?.ok) return { ok: true, deleted: body.deleted };
  return { error: "Unexpected response" };
}

