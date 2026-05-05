// delete-ai-memory — Delete AI "memory" without deleting account (GDPR support; purpose limitation)
// Deletes per-user AI artifacts:
// - profile_embeddings (vector profile) for one mode or all modes
// - ai_plan_cache rows where the user participates (user_a or user_b), optionally mode-scoped
// - ai_requests telemetry for the user (optional; default true)
// - ai_match_agent_proposals created by the user (optional; default true)
// - user_concierge_signals (optional; default false; this is explicit "preference memory")
//
// Requires: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_MODES = ["romance", "friends", "business", "events"] as const;
type Mode = (typeof ALLOWED_MODES)[number];

type DeleteAiMemoryRequest = {
  mode?: Mode | "all";
  delete_requests?: boolean;
  delete_match_agent_proposals?: boolean;
  delete_concierge_signals?: boolean;
  delete_plan_cache?: boolean;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
  if (userError || !user?.id) {
    return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  let body: DeleteAiMemoryRequest = {};
  try {
    body = (await req.json()) as DeleteAiMemoryRequest;
  } catch {
    body = {};
  }

  const mode = body.mode ?? "all";
  const deleteRequests = body.delete_requests !== false;
  const deleteMatchAgentProposals = body.delete_match_agent_proposals !== false;
  const deleteConciergeSignals = body.delete_concierge_signals === true;
  const deletePlanCache = body.delete_plan_cache !== false;

  const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // 1) Vector profile / embeddings
    if (mode === "all") {
      await admin.from("profile_embeddings").delete().eq("user_id", user.id);
    } else if (ALLOWED_MODES.includes(mode)) {
      await admin.from("profile_embeddings").delete().eq("user_id", user.id).eq("mode", mode);
    } else {
      return new Response(JSON.stringify({ error: "Invalid mode" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // 2) Cached LLM plans
    if (deletePlanCache) {
      const q = admin.from("ai_plan_cache").delete().or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`);
      if (mode !== "all" && ALLOWED_MODES.includes(mode)) q.eq("mode", mode);
      await q;
    }

    // 3) AI telemetry (no prompts stored, but let users clear usage records)
    if (deleteRequests) {
      const q = admin.from("ai_requests").delete().eq("user_id", user.id);
      if (mode !== "all" && ALLOWED_MODES.includes(mode)) q.eq("mode", mode);
      await q;
    }

    // 4) Match Agent drafts/proposals created by the user
    if (deleteMatchAgentProposals) {
      const q = admin.from("ai_match_agent_proposals").delete().eq("created_by", user.id);
      if (mode !== "all" && ALLOWED_MODES.includes(mode)) q.eq("mode", mode);
      await q;
    }

    // 5) Explicit preference memory (optional; user must confirm)
    if (deleteConciergeSignals) {
      await admin.from("user_concierge_signals").delete().eq("user_id", user.id);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        deleted: {
          mode,
          profile_embeddings: true,
          ai_plan_cache: deletePlanCache,
          ai_requests: deleteRequests,
          ai_match_agent_proposals: deleteMatchAgentProposals,
          user_concierge_signals: deleteConciergeSignals,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } },
    );
  } catch (err) {
    console.error("delete-ai-memory error:", err);
    return new Response(JSON.stringify({ error: "Delete AI memory failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});

