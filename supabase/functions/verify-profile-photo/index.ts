/**
 * verify-profile-photo — AI-assisted selfie vs profile photo check (AWS Rekognition optional).
 * Body: { selfie_path: string, profile_photo_index?: number }
 * Inserts profile_photo_verifications; on success sets profiles_core.photo_verified_at.
 * Secrets: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION (optional).
 * Dev: MOCK_FACE_MATCH=true treats any pair as verified (never in production).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const cors = corsHeaders(req, {
    methods: "POST, OPTIONS",
    headers: "authorization, x-client-info, apikey, content-type",
  });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...Object.fromEntries(cors), "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...Object.fromEntries(cors), "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { ...Object.fromEntries(cors), "Content-Type": "application/json" },
    });
  }
  const uid = userData.user.id;

  let body: { selfie_path?: string; profile_photo_index?: number };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...Object.fromEntries(cors), "Content-Type": "application/json" },
    });
  }

  const selfiePath = body.selfie_path?.trim();
  const profilePhotoIndex = typeof body.profile_photo_index === "number" ? body.profile_photo_index : 0;
  if (!selfiePath) {
    return new Response(JSON.stringify({ error: "selfie_path required" }), {
      status: 400,
      headers: { ...Object.fromEntries(cors), "Content-Type": "application/json" },
    });
  }

  const { data: core } = await admin.from("profiles_core").select("core_photos").eq("id", uid).single();
  const photos = (core?.core_photos as string[] | null) ?? [];
  const profileUrl = photos[profilePhotoIndex];
  if (!profileUrl) {
    return new Response(JSON.stringify({ error: "Profile photo not found at index" }), {
      status: 400,
      headers: { ...Object.fromEntries(cors), "Content-Type": "application/json" },
    });
  }

  const mock = Deno.env.get("MOCK_FACE_MATCH") === "true";
  const region = Deno.env.get("AWS_REGION") ?? Deno.env.get("AWS_DEFAULT_REGION");
  const ak = Deno.env.get("AWS_ACCESS_KEY_ID");
  const sk = Deno.env.get("AWS_SECRET_ACCESS_KEY");

  let status: "pending" | "verified" | "rejected" = "pending";
  let similarity: number | null = null;
  let provider = "none";
  let raw: Record<string, unknown> = {};

  async function downloadBytes(pathOrUrl: string): Promise<Uint8Array> {
    if (pathOrUrl.startsWith("http")) {
      const r = await fetch(pathOrUrl);
      return new Uint8Array(await r.arrayBuffer());
    }
    const bucket = "user-photos";
    const { data, error } = await admin.storage.from(bucket).download(pathOrUrl);
    if (error || !data) throw new Error(error?.message ?? "download failed");
    return new Uint8Array(await data.arrayBuffer());
  }

  try {
    if (mock) {
      status = "verified";
      similarity = 99.9;
      provider = "mock";
      raw = { note: "MOCK_FACE_MATCH" };
    } else if (region && ak && sk) {
      const { RekognitionClient, CompareFacesCommand } = await import(
        "npm:@aws-sdk/client-rekognition@3.600.0"
      );
      const client = new RekognitionClient({ region, credentials: { accessKeyId: ak, secretAccessKey: sk } });
      const sourceBytes = await downloadBytes(selfiePath);
      const targetBytes = await downloadBytes(profileUrl);

      const out = await client.send(
        new CompareFacesCommand({
          SourceImage: { Bytes: sourceBytes },
          TargetImage: { Bytes: targetBytes },
          SimilarityThreshold: 85,
        })
      );
      const best = out.FaceMatches?.[0]?.Similarity ?? 0;
      similarity = best;
      raw = { faceMatches: out.FaceMatches?.length ?? 0, unmatched: out.UnmatchedFaces?.length ?? 0 };
      provider = "aws_rekognition";
      status = best >= 90 ? "verified" : "rejected";
    } else {
      status = "pending";
      provider = "pending_config";
      raw = { message: "Configure AWS Rekognition secrets or MOCK_FACE_MATCH for dev" };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    status = "rejected";
    raw = { error: msg };
    provider = "error";
  }

  const { data: row, error: insErr } = await admin
    .from("profile_photo_verifications")
    .insert({
      user_id: uid,
      status,
      selfie_storage_path: selfiePath,
      profile_photo_index: profilePhotoIndex,
      provider,
      similarity_score: similarity,
      raw_response: raw,
      updated_at: new Date().toISOString(),
    })
    .select("id, status, similarity_score")
    .single();

  if (insErr) {
    return new Response(JSON.stringify({ error: insErr.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (status === "verified") {
    await admin.from("profiles_core").update({ photo_verified_at: new Date().toISOString() }).eq("id", uid);
  }

  return new Response(JSON.stringify({ verification: row }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
