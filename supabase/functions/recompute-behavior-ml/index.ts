/**
 * recompute-behavior-ml — Sync behavior_pair_signals → compatibility_scores.behavior_affinity;
 * optional SageMaker / custom ML endpoint; optional Upstash Redis cache bust.
 * POST body: { user_id?: string, mode?: string } — scope (default: all recent pairs).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  const authHeader = req.headers.get("Authorization");
  if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: "Forbidden — use service role from cron or admin" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (!url) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(url, serviceKey);
  const mlUrl = Deno.env.get("SAGEMAKER_RUNTIME_ENDPOINT");
  const mlKey = Deno.env.get("SAGEMAKER_API_KEY");

  let body: { user_id?: string; mode?: string } = {};
  try {
    if (req.headers.get("content-length") !== "0") body = await req.json();
  } catch { /* empty */ }

  const modeFilter = body.mode as string | undefined;
  const userFilter = body.user_id;

  let query = admin.from("behavior_pair_signals").select("*").order("updated_at", { ascending: false }).limit(5000);
  if (modeFilter) query = query.eq("mode", modeFilter);
  if (userFilter) query = query.or(`user_a_id.eq.${userFilter},user_b_id.eq.${userFilter}`);

  const { data: rows, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let updated = 0;
  let mlCalls = 0;

  for (const r of rows ?? []) {
    const ua = r.user_a_id as string;
    const ub = r.user_b_id as string;
    const mode = r.mode as string;
    const aff = Number(r.affinity_score) ?? 0.5;

    let mlScore: number | null = null;
    if (mlUrl) {
      try {
        const res = await fetch(mlUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(mlKey ? { Authorization: `Bearer ${mlKey}` } : {}),
          },
          body: JSON.stringify({
            user_a_id: ua,
            user_b_id: ub,
            mode,
            message_count: r.message_count,
            affinity_score: aff,
          }),
        });
        if (res.ok) {
          const j = await res.json();
          if (typeof j?.score === "number") mlScore = j.score;
          mlCalls++;
        }
      } catch { /* optional */ }
    }

    const patch: Record<string, unknown> = {
      behavior_affinity: aff,
      updated_at: new Date().toISOString(),
    };
    if (mlScore != null) patch.ml_rank_score = mlScore;

    const { data: patchRows, error: cErr } = await admin
      .from("compatibility_scores")
      .update(patch)
      .eq("user_a_id", ua)
      .eq("user_b_id", ub)
      .eq("mode", mode)
      .select("id");

    if (!cErr && patchRows && patchRows.length > 0) updated++;
  }

  const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
  const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
  if (redisUrl && redisToken && userFilter) {
    try {
      await fetch(`${redisUrl}/del/winkly:feed:${userFilter}`, {
        headers: { Authorization: `Bearer ${redisToken}` },
      });
    } catch { /* optional */ }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      pairs_processed: rows?.length ?? 0,
      compatibility_rows_updated: updated,
      sagemaker_calls: mlCalls,
    }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
  );
});
