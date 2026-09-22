/**
 * moderate-media — server-side image moderation for profile photos and chat images.
 * See docs/MODERATION.md for the full flow.
 *
 * Two callers:
 *
 * 1. The app (user JWT in Authorization):
 *    { kind: "profile_photo", path: "<uid>/<core|romance|friends|business>/<file>" }
 *       `path` is in the PRIVATE `media-quarantine` bucket. Clients can no longer write
 *       to the public `user-photos` bucket — only this function promotes a photo there.
 *       pass   → copied to user-photos, quarantine copy deleted → { status, url }
 *       review → stays in quarantine (only the uploader can read it) → { status }
 *       block  → quarantine copy deleted → { status }
 *    { kind: "chat_image", path: "<uid>/<conversationId>/<file>" }
 *       `path` is in the PRIVATE `chat-media` bucket (already member-gated).
 *       pass / review → kept; recipients see "review" images blurred behind "Tap to view"
 *       block         → object deleted → { status }
 *
 * 2. Postgres (x-webhook-secret = WEBHOOK_SECRET), after a moderator changes a row's
 *    status in Supabase Studio:
 *    { action: "resolve", id }
 *       review → pass  (profile photo): promote to user-photos and append to the profile
 *       → block        : delete the object (and, for an already-public photo, remove it
 *                        from every profile photo array — i.e. a takedown)
 *
 * Fail closed: vendor down / misconfigured / unparseable → "review", never "pass".
 * verify_jwt = false in config.toml because the DB trigger has no user JWT; the user
 * path authenticates itself with auth.getUser() exactly like verify-profile-photo.
 *
 * Secrets: MODERATION_PROVIDER + vendor keys (see _shared/moderation/providers.ts),
 *          WEBHOOK_SECRET (shared with the DB triggers).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { timingSafeEqual } from "../_shared/timingSafeEqual.ts";
import { moderateImage } from "../_shared/moderation/providers.ts";

const QUARANTINE_BUCKET = "media-quarantine";
const PUBLIC_PHOTO_BUCKET = "user-photos";
const CHAT_BUCKET = "chat-media";
const PROFILE_TARGETS = new Set(["core", "romance", "friends", "business"]);
/** Per-user moderation calls per rolling hour. Vendor calls cost money; this is abuse protection. */
const HOURLY_LIMIT = 120;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE_RE = /^[A-Za-z0-9._-]{1,128}$/;

type Row = {
  id: string;
  user_id: string;
  kind: "profile_photo" | "chat_image";
  bucket: string;
  storage_path: string;
  target: string | null;
  public_url: string | null;
  status: "pass" | "review" | "block";
};

function mimeFor(path: string, blobType: string | undefined): string {
  if (blobType && blobType.startsWith("image/")) return blobType;
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic" || ext === "heif") return `image/${ext}`;
  return "image/jpeg";
}

/** Splits "<uid>/<segment>/<file>" and rejects anything else (no nesting, no traversal). */
function parsePath(path: unknown): [string, string, string] | null {
  if (typeof path !== "string") return null;
  const parts = path.split("/");
  if (parts.length !== 3 || !FILE_RE.test(parts[2]) || parts[2].startsWith(".")) return null;
  return [parts[0], parts[1], parts[2]];
}

serve(async (req) => {
  const cors = corsHeaders(req, {
    methods: "POST, OPTIONS",
    headers: "authorization, x-client-info, apikey, content-type",
  });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...Object.fromEntries(cors), "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ── DB-trigger path: a moderator resolved a row in Studio ────────────────────
  if (body.action === "resolve") {
    const expected = Deno.env.get("WEBHOOK_SECRET") ?? "";
    const provided = req.headers.get("x-webhook-secret") ?? "";
    if (!expected || !timingSafeEqual(provided, expected)) return json({ error: "Unauthorized" }, 401);
    if (typeof body.id !== "string" || !UUID_RE.test(body.id)) return json({ error: "id required" }, 400);
    try {
      return json(await resolve(admin, body.id));
    } catch (e) {
      console.error("moderate-media resolve failed", e);
      return json({ error: "resolve failed" }, 500);
    }
  }

  // ── App path ─────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Invalid session" }, 401);
  const uid = userData.user.id;

  const kind = body.kind;
  if (kind !== "profile_photo" && kind !== "chat_image") return json({ error: "Invalid kind" }, 400);
  const parts = parsePath(body.path);
  if (!parts || parts[0] !== uid) return json({ error: "Invalid path" }, 400);
  const [, segment] = parts;
  const path = body.path as string;
  const bucket = kind === "profile_photo" ? QUARANTINE_BUCKET : CHAT_BUCKET;

  if (kind === "profile_photo" && !PROFILE_TARGETS.has(segment)) return json({ error: "Invalid target" }, 400);
  if (kind === "chat_image") {
    if (!UUID_RE.test(segment)) return json({ error: "Invalid conversation" }, 400);
    const { data: member } = await admin
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", segment)
      .eq("user_id", uid)
      .is("left_at", null)
      .maybeSingle();
    if (!member) return json({ error: "Not a member of this conversation" }, 403);
  }

  // Idempotent: a retry after a dropped response returns the stored verdict.
  const { data: existing } = await admin
    .from("media_moderation")
    .select("id, status, public_url")
    .eq("bucket", bucket)
    .eq("storage_path", path)
    .maybeSingle();
  if (existing) return json({ id: existing.id, status: existing.status, url: existing.public_url ?? undefined });

  // Abuse guard. Fail closed: if we can't count, we don't call the vendor.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countErr } = await admin
    .from("media_moderation")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid)
    .gte("created_at", since);
  if (countErr || (count ?? 0) >= HOURLY_LIMIT) return json({ error: "Too many uploads, try again later" }, 429);

  const { data: blob, error: dlErr } = await admin.storage.from(bucket).download(path);
  if (dlErr || !blob) return json({ error: "Upload not found" }, 404);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = mimeFor(path, blob.type);

  const result = await moderateImage(bytes, mime);
  let publicUrl: string | null = null;

  if (kind === "profile_photo" && result.status === "pass") {
    publicUrl = await promote(admin, path, bytes, mime);
    if (!publicUrl) return json({ error: "Could not publish photo" }, 500);
  }

  const { data: row, error: insErr } = await admin
    .from("media_moderation")
    .insert({
      user_id: uid,
      kind,
      bucket,
      storage_path: path,
      target: segment,
      public_url: publicUrl,
      status: result.status,
      reasons: result.reasons,
      provider: result.provider,
      signals: result.signals,
      failed_closed: result.failedClosed,
    })
    .select("id, status")
    .single();
  if (insErr || !row) {
    console.error("moderate-media insert failed", insErr);
    // Never leave an unrecorded object publicly visible.
    if (publicUrl) await admin.storage.from(PUBLIC_PHOTO_BUCKET).remove([path]);
    return json({ error: "Could not record moderation result" }, 500);
  }

  if (result.status === "block") await admin.storage.from(bucket).remove([path]);

  return json({ id: row.id, status: row.status, url: publicUrl ?? undefined });
});

/** Copy a quarantined profile photo to the public bucket (same relative path) and drop the quarantine copy. */
async function promote(admin: SupabaseClient, path: string, bytes: Uint8Array, mime: string): Promise<string | null> {
  const { error } = await admin.storage.from(PUBLIC_PHOTO_BUCKET).upload(path, bytes, {
    contentType: mime,
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) {
    console.error("moderate-media promote failed", error);
    return null;
  }
  await admin.storage.from(QUARANTINE_BUCKET).remove([path]);
  return admin.storage.from(PUBLIC_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function resolve(admin: SupabaseClient, id: string): Promise<Record<string, unknown>> {
  const { data, error } = await admin.from("media_moderation").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  const row = data as Row | null;
  if (!row) return { ok: false, reason: "not_found" };

  if (row.status === "pass" && row.kind === "profile_photo" && !row.public_url) {
    const { data: blob, error: dlErr } = await admin.storage.from(QUARANTINE_BUCKET).download(row.storage_path);
    if (dlErr || !blob) return { ok: false, reason: "quarantine_object_missing" };
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const url = await promote(admin, row.storage_path, bytes, mimeFor(row.storage_path, blob.type));
    if (!url) throw new Error("promote failed");
    await admin.from("media_moderation").update({ public_url: url }).eq("id", id);
    await appendToProfile(admin, row.user_id, row.target ?? "core", url);
    return { ok: true, action: "promoted" };
  }

  if (row.status === "block") {
    await admin.storage.from(row.bucket).remove([row.storage_path]);
    if (row.kind === "profile_photo" && row.public_url) {
      await admin.storage.from(PUBLIC_PHOTO_BUCKET).remove([row.storage_path]);
      await removeFromProfile(admin, row.user_id, row.public_url);
    }
    return { ok: true, action: "removed" };
  }

  return { ok: true, action: "none" };
}

/** Append an approved photo to the end of the matching profile array (never makes it primary over existing photos). */
async function appendToProfile(admin: SupabaseClient, userId: string, target: string, url: string) {
  const add = (arr: string[] | null | undefined) => (arr ?? []).includes(url) ? (arr ?? []) : [...(arr ?? []), url];
  if (target === "core") {
    const { data: core } = await admin.from("profiles_core").select("core_photos").eq("id", userId).maybeSingle();
    if (core) await admin.from("profiles_core").update({ core_photos: add(core.core_photos) }).eq("id", userId);
    const { data: up } = await admin
      .from("user_profiles")
      .select("core_photos, main_photo_url")
      .eq("id", userId)
      .maybeSingle();
    if (up) {
      const next = add(up.core_photos);
      await admin
        .from("user_profiles")
        .update({ core_photos: next, main_photo_url: up.main_photo_url ?? next[0] ?? null })
        .eq("id", userId);
    }
    return;
  }
  for (const table of ["sub_profiles", "profiles_mode"]) {
    const { data: sub } = await admin.from(table).select("photos").eq("user_id", userId).eq("mode", target).maybeSingle();
    if (sub) await admin.from(table).update({ photos: add(sub.photos) }).eq("user_id", userId).eq("mode", target);
  }
}

/** Takedown: remove a URL from every photo array of the user. */
async function removeFromProfile(admin: SupabaseClient, userId: string, url: string) {
  const drop = (arr: string[] | null | undefined) => (arr ?? []).filter((u) => u !== url);
  const { data: core } = await admin.from("profiles_core").select("core_photos").eq("id", userId).maybeSingle();
  if (core) await admin.from("profiles_core").update({ core_photos: drop(core.core_photos) }).eq("id", userId);
  const { data: up } = await admin.from("user_profiles").select("core_photos, main_photo_url").eq("id", userId).maybeSingle();
  if (up) {
    const next = drop(up.core_photos);
    await admin
      .from("user_profiles")
      .update({ core_photos: next, main_photo_url: up.main_photo_url === url ? next[0] ?? null : up.main_photo_url })
      .eq("id", userId);
  }
  for (const table of ["sub_profiles", "profiles_mode"]) {
    const { data: subs } = await admin.from(table).select("mode, photos").eq("user_id", userId);
    for (const s of subs ?? []) {
      if ((s.photos ?? []).includes(url)) {
        await admin.from(table).update({ photos: drop(s.photos) }).eq("user_id", userId).eq("mode", s.mode);
      }
    }
  }
}
