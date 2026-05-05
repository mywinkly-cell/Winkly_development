// ai-gateway — Mode-locked AI gateway (spec v8.1)
// Validates session, validates mode, allowlisted fields only, no provider keys to client

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_MODES = ["romance", "friends", "business", "events"];
const ALLOWED_TASKS = ["rank", "suggest", "summarize"];

type AiGatewayRequest = {
  mode: string;
  task: string;
  context?: Record<string, unknown>;
  candidates?: Array<Record<string, unknown>>;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid authorization" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid session" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const body: AiGatewayRequest = await req.json();
    const { mode, task, context = {}, candidates = [] } = body;

    if (!ALLOWED_MODES.includes(mode)) {
      return new Response(
        JSON.stringify({ error: "Invalid mode" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!ALLOWED_TASKS.includes(task)) {
      return new Response(
        JSON.stringify({ error: "Invalid task" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Log telemetry (no raw chat text)
    await supabase.from("ai_requests").insert({
      user_id: user.id,
      mode,
      task,
    });

    // TODO: Call LLM via provider (OpenAI/Anthropic) with allowlisted fields only
    // For MVP return stub response
    const result = {
      ranked: candidates.slice(0, 5).map((c, i) => ({ ...c, rank: i + 1 })),
      suggestions: [],
    };

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    console.error("ai-gateway error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
