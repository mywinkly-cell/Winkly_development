/**
 * Preference engine — merges structured signals (user_concierge_signals) with profiles_mode for concierge.
 * Server-side merge also runs in ai-gateway; this module supports client previews and prompts.
 */

import { supabase } from "@/lib/supabase";

export type ConciergePreferenceSignals = {
  avoid?: string[];
  prefer?: string[];
  noise_level?: "low" | "medium" | "high";
  professional_topics?: string[];
};

/** Load current user's concierge signals (optional UI / settings). */
export async function getMyConciergeSignals(): Promise<ConciergePreferenceSignals> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return {};
  const { data } = await supabase.from("user_concierge_signals").select("signals").eq("user_id", uid).maybeSingle();
  const s = data?.signals as ConciergePreferenceSignals | undefined;
  return s && typeof s === "object" ? s : {};
}

/** Upsert structured signals (e.g. after onboarding quiz: avoid loud bars, prefer garden cafés). */
export async function upsertMyConciergeSignals(signals: ConciergePreferenceSignals): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");
  const { error } = await supabase.from("user_concierge_signals").upsert({
    user_id: uid,
    signals: signals as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Shared interest line for stale networking nudge (business mode). */
export async function getSharedInterestHintForPair(
  myUserId: string,
  partnerUserId: string,
  mode: "business" | "friends"
): Promise<string | null> {
  const sel = "interests, meta";
  const [a, b] = await Promise.all([
    supabase.from("profiles_mode").select(sel).eq("user_id", myUserId).eq("mode", mode).maybeSingle(),
    supabase.from("profiles_mode").select(sel).eq("user_id", partnerUserId).eq("mode", mode).maybeSingle(),
  ]);
  const ai = (a.data?.interests as string[] | null) ?? [];
  const bi = (b.data?.interests as string[] | null) ?? [];
  const metaA = (a.data?.meta as Record<string, unknown> | null)?.networking_goals;
  const metaB = (b.data?.meta as Record<string, unknown> | null)?.networking_goals;
  const ngA = Array.isArray(metaA) ? metaA : typeof metaA === "string" ? [metaA] : [];
  const ngB = Array.isArray(metaB) ? metaB : typeof metaB === "string" ? [metaB] : [];
  const shared = ai.filter((x) => bi.includes(x)).slice(0, 2);
  const sharedNg = (ngA as string[]).filter((x) => (ngB as string[]).includes(x)).slice(0, 1);
  if (sharedNg.length) return String(sharedNg[0]);
  if (shared.length) return shared.join(" & ");
  return null;
}
