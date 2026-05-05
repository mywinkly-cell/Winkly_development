/**
 * recompute-compatibility — Layer 1 background job (no LLM).
 * Computes compatibility from structured data; stores in compatibility_scores.
 * Trigger: profile update, interest update, new user; or cron.
 * Body: { user_id?: string, mode?: string } — optional scope.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, withCorsEmpty } from "../_shared/cors.ts";

const MODES = ["romance", "friends", "business"] as const;

type Mode = (typeof MODES)[number];

type CoreRow = {
  id: string;
  city: string | null;
};

function normalizeTags(arr: string[] | null | undefined): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((x) => typeof x === "string" && x.trim().length > 0).map((x) => x.trim().toLowerCase());
}

function intersection(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x));
}

function locationBucket(cityA: string | null | undefined, cityB: string | null | undefined): string {
  if (!cityA || !cityB) return "unknown";
  const a = cityA.toLowerCase().split(",")[0].trim();
  const b = cityB.toLowerCase().split(",")[0].trim();
  if (a === b) return "same_city";
  return "other";
}

function budgetFromMeta(meta: Record<string, unknown> | null): { low?: number; high?: number } | null {
  if (!meta || typeof meta !== "object") return null;
  const budget = meta.budget ?? meta.budget_tier ?? meta.budget_range;
  if (typeof budget === "object" && budget !== null && "low" in budget && "high" in budget)
    return { low: (budget as { low?: number }).low, high: (budget as { high?: number }).high };
  return null;
}

function budgetOverlap(
  b1: { low?: number; high?: number } | null,
  b2: { low?: number; high?: number } | null
): boolean {
  if (!b1 || !b2) return false;
  const l1 = b1.low ?? 0;
  const h1 = b1.high ?? 999;
  const l2 = b2.low ?? 0;
  const h2 = b2.high ?? 999;
  return !(h1 < l2 || h2 < l1);
}

function activityTagsFromMeta(meta: Record<string, unknown> | null): string[] {
  if (!meta || typeof meta !== "object") return [];
  const act = meta.activity_preferences ?? meta.activities ?? meta.preferred_activities;
  if (Array.isArray(act)) return act.filter((x) => typeof x === "string").map((x) => String(x).trim().toLowerCase());
  return [];
}

/** Compute compatibility from two profiles (no LLM). */
function computePair(
  userA: string,
  userB: string,
  profileA: { interests: string[]; activityTags: string[]; city: string | null; budget: ReturnType<typeof budgetFromMeta> },
  profileB: { interests: string[]; activityTags: string[]; city: string | null; budget: ReturnType<typeof budgetFromMeta> }
): {
  compatibility_score: number;
  shared_interest_tags: string[];
  shared_activity_tags: string[];
  budget_overlap: boolean;
  location_proximity_bucket: string;
  confidence_score: number;
} {
  const sharedInterests = intersection(profileA.interests, profileB.interests);
  const sharedActivity = intersection(profileA.activityTags, profileB.activityTags);
  const locBucket = locationBucket(profileA.city, profileB.city);
  const budgetOverlapVal = budgetOverlap(profileA.budget, profileB.budget);

  let score = 0.5;
  score += Math.min(sharedInterests.length * 0.08, 0.2);
  score += Math.min(sharedActivity.length * 0.05, 0.15);
  if (locBucket === "same_city") score += 0.1;
  if (budgetOverlapVal) score += 0.05;
  score = Math.min(1, Math.max(0, score));

  const dataPoints = [
    profileA.interests.length > 0 || profileB.interests.length > 0,
    profileA.city && profileB.city,
    profileA.budget || profileB.budget,
  ].filter(Boolean).length;
  const confidence_score = 0.3 + (dataPoints / 3) * 0.7;

  return {
    compatibility_score: Math.round(score * 100) / 100,
    shared_interest_tags: sharedInterests.slice(0, 20),
    shared_activity_tags: sharedActivity.slice(0, 20),
    budget_overlap: budgetOverlapVal,
    location_proximity_bucket: locBucket,
    confidence_score: Math.round(confidence_score * 100) / 100,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return withCorsEmpty(req, { status: 204 });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  const cors = corsHeaders(req);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let body: { user_id?: string; mode?: string } = {};
  try {
    body = (await req.json()) as { user_id?: string; mode?: string };
  } catch {
    // empty body ok
  }

  const scopeUserId = body.user_id ?? null;
  const scopeMode = body.mode && MODES.includes(body.mode as Mode) ? (body.mode as Mode) : null;

  const modesToProcess: Mode[] = scopeMode ? [scopeMode] : [...MODES];
  let processed = 0;
  const errors: string[] = [];

  for (const mode of modesToProcess) {
    let pairs: [string, string][] = [];

    if (mode === "romance") {
      if (scopeUserId) {
        const { data: mutual } = await supabase.rpc("romance_connections", { current_user_id: scopeUserId });
        const ids = (mutual ?? []) as { id?: string }[];
        const matchIds = ids.map((r) => r.id).filter(Boolean) as string[];
        pairs = matchIds.map((id) => [scopeUserId, id].sort() as [string, string]);
      }
      // Full romance batch: invoke with user_id per user (e.g. cron over recently updated users)
    } else {
      const { data: follows } = await supabase.from("follows").select("follower_id, followee_id");
      const followSet = new Set<string>();
      (follows ?? []).forEach((f: { follower_id: string; followee_id: string }) => {
        followSet.add(`${f.follower_id},${f.followee_id}`);
      });
      const mutual: [string, string][] = [];
      followSet.forEach((key) => {
        const [a, b] = key.split(",");
        if (followSet.has(`${b},${a}`)) mutual.push([a, b].sort() as [string, string]);
      });
      if (scopeUserId) {
        pairs = mutual.filter(([u, v]) => u === scopeUserId || v === scopeUserId);
      } else {
        pairs = mutual.slice(0, 1000);
      }
    }

    const uniquePairs = Array.from(new Map(pairs.map((p) => [p.join(","), p])).values());

    for (const [uidA, uidB] of uniquePairs) {
      const [profA, profB, coreA, coreB] = await Promise.all([
        supabase.from("profiles_mode").select("interests, meta").eq("user_id", uidA).eq("mode", mode).maybeSingle(),
        supabase.from("profiles_mode").select("interests, meta").eq("user_id", uidB).eq("mode", mode).maybeSingle(),
        supabase.from("profiles_core").select("city").eq("id", uidA).maybeSingle(),
        supabase.from("profiles_core").select("city").eq("id", uidB).maybeSingle(),
      ]);

      const metaA = (profA.data?.meta ?? {}) as Record<string, unknown>;
      const metaB = (profB.data?.meta ?? {}) as Record<string, unknown>;
      const profileA = {
        interests: normalizeTags(profA.data?.interests ?? null),
        activityTags: activityTagsFromMeta(metaA),
        city: (coreA.data as CoreRow | null)?.city ?? null,
        budget: budgetFromMeta(metaA),
      };
      const profileB = {
        interests: normalizeTags(profB.data?.interests ?? null),
        activityTags: activityTagsFromMeta(metaB),
        city: (coreB.data as CoreRow | null)?.city ?? null,
        budget: budgetFromMeta(metaB),
      };

      const result = computePair(uidA, uidB, profileA, profileB);
      const ua = uidA < uidB ? uidA : uidB;
      const ub = uidA < uidB ? uidB : uidA;

      const { error } = await supabase.rpc("upsert_compatibility_score", {
        p_user_a_id: ua,
        p_user_b_id: ub,
        p_mode: mode,
        p_compatibility_score: result.compatibility_score,
        p_shared_interest_tags: result.shared_interest_tags,
        p_shared_activity_tags: result.shared_activity_tags,
        p_budget_overlap: result.budget_overlap,
        p_location_proximity_bucket: result.location_proximity_bucket,
        p_confidence_score: result.confidence_score,
      });
      if (error) errors.push(`${ua}-${ub}: ${error.message}`);
      else processed++;
    }
  }

  return new Response(
    JSON.stringify({
      ok: errors.length === 0,
      processed,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    }),
    { status: 200, headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) } }
  );
});
