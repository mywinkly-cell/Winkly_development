// delete-account — Permanent account deletion (GDPR erasure)
// 1. Verifies the requesting user via JWT
// 2. Deletes user's files from Storage (user-photos, user-videos, business-logos)
// 3. Deletes auth.users(id) — CASCADE removes all public rows referencing this user
// Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (and anon key for auth verification)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, withCorsEmpty, withCorsJson } from "../_shared/cors.ts";

const BUCKETS = ["user-photos", "user-videos", "business-logos"];

/** Collect all object paths under prefix (one level of subfolders: userId/mode/file). */
async function listPathsInBucket(
  adminClient: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const paths: string[] = [];
  const { data: top } = await adminClient.storage.from(bucket).list(prefix, { limit: 1000 });
  if (!top?.length) return paths;
  for (const item of top) {
    if (!item.name) continue;
    const fullPath = prefix + item.name;
    if (item.name.includes(".")) {
      paths.push(fullPath);
    } else {
      const { data: sub } = await adminClient.storage.from(bucket).list(fullPath + "/", { limit: 1000 });
      for (const f of sub ?? []) {
        if (f.name) paths.push(`${fullPath}/${f.name}`);
      }
    }
  }
  return paths;
}

async function deleteUserStorage(adminClient: ReturnType<typeof createClient>, userId: string): Promise<void> {
  const prefix = `${userId}/`;
  for (const bucket of BUCKETS) {
    const paths = await listPathsInBucket(adminClient, bucket, prefix);
    if (paths.length > 0) {
      await adminClient.storage.from(bucket).remove(paths);
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return withCorsEmpty(req, { status: 204 });
  }
  if (req.method !== "POST") {
    return withCorsJson(req, { error: "Method not allowed" }, { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return withCorsJson(req, { error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    console.error("Missing Supabase env");
    return withCorsJson(req, { error: "Server configuration error" }, { status: 500 });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader, ...Object.fromEntries(corsHeaders(req)) } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
  if (userError || !user?.id) {
    return withCorsJson(req, { error: "Invalid or expired session" }, { status: 401 });
  }

  const userId = user.id;
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    await deleteUserStorage(adminClient, userId);
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("auth.admin.deleteUser error:", deleteError);
      return withCorsJson(req, { error: deleteError.message ?? "Account deletion failed" }, { status: 400 });
    }
    return withCorsJson(req, { ok: true }, { status: 200 });
  } catch (err) {
    console.error("delete-account error:", err);
    return withCorsJson(req, { error: "Account deletion failed" }, { status: 500 });
  }
});
