// export-account — GDPR data portability (Art. 20)
// 1. Verifies the requesting user via JWT (same pattern as delete-account)
// 2. Rate limit: 1 export per 24h (users.last_export_at)
// 3. Collects user-scoped rows into JSON, uploads to private account-exports bucket
// 4. Returns a short-lived signed URL
//
// Requires: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, withCorsEmpty, withCorsJson } from "../_shared/cors.ts";
import {
  EXPORT_RATE_LIMIT_HOURS,
  hoursUntilNextExport,
  isExportRateLimited,
  partitionMessages,
  SIGNED_URL_EXPIRES_SECONDS,
  type MessageRow,
} from "../_shared/gdprExportCollect.ts";

const EXPORT_BUCKET = "account-exports";

type ExportAccountRequest = {
  analytics_consent?: {
    cookies_accepted?: boolean;
    source?: string;
  };
};

async function collectUserExport(
  admin: ReturnType<typeof createClient>,
  userId: string,
  authEmail: string | undefined,
  analyticsConsent: ExportAccountRequest["analytics_consent"],
) {
  const [
    userRow,
    profilesCore,
    profilesMode,
    profilesBusiness,
    subProfiles,
    romanceLikes,
    friendsRequests,
    businessConnections,
    memberRows,
    memberSettings,
    plannerItemsCreated,
    plannerParticipants,
    wishlistItems,
    userPreferences,
    userBlocks,
    eventsCreated,
    eventParticipants,
    aiRequests,
  ] = await Promise.all([
    admin.from("users").select("*").eq("id", userId).maybeSingle(),
    admin.from("profiles_core").select("*").eq("id", userId),
    admin.from("profiles_mode").select("*").eq("user_id", userId),
    admin.from("profiles_business").select("*").eq("id", userId),
    admin.from("sub_profiles").select("*").eq("user_id", userId),
    admin.from("romance_likes").select("*").or(`liker_id.eq.${userId},liked_id.eq.${userId}`),
    admin.from("friends_requests").select("*").or(`requester_id.eq.${userId},recipient_id.eq.${userId}`),
    admin.from("business_connections").select("*").or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`),
    admin.from("conversation_members").select("*").eq("user_id", userId),
    admin.from("conversation_member_settings").select("*").eq("user_id", userId),
    admin.from("planner_items").select("*").eq("created_by", userId),
    admin.from("planner_participants").select("*").eq("user_id", userId),
    admin.from("wishlist_items").select("*").eq("user_id", userId),
    admin.from("user_preferences").select("*").eq("user_id", userId),
    admin.from("user_blocks").select("*").eq("blocker_id", userId),
    admin.from("events").select("*").eq("created_by", userId),
    admin.from("event_participants").select("*").eq("user_id", userId),
    admin.from("ai_requests").select("*").eq("user_id", userId),
  ]);

  const conversationIds = [...new Set((memberRows.data ?? []).map((m) => m.conversation_id as string))];

  let conversations: Record<string, unknown>[] = [];
  let conversationMembers: Record<string, unknown>[] = [];
  let messagesSent: MessageRow[] = [];
  let messagesMetadata: ReturnType<typeof partitionMessages>["messages_metadata"] = [];

  if (conversationIds.length > 0) {
    const [convRes, membersRes, messagesRes] = await Promise.all([
      admin.from("conversations").select("*").in("id", conversationIds),
      admin.from("conversation_members").select("*").in("conversation_id", conversationIds),
      admin.from("messages").select("*").in("conversation_id", conversationIds),
    ]);
    conversations = convRes.data ?? [];
    conversationMembers = membersRes.data ?? [];
    const partitioned = partitionMessages((messagesRes.data ?? []) as MessageRow[], userId);
    messagesSent = partitioned.messages_sent;
    messagesMetadata = partitioned.messages_metadata;
  }

  const participantPlannerIds = (plannerParticipants.data ?? []).map((p) => p.planner_item_id as string);
  let plannerItemsJoined: Record<string, unknown>[] = [];
  if (participantPlannerIds.length > 0) {
    const { data } = await admin
      .from("planner_items")
      .select("*")
      .in("id", participantPlannerIds)
      .neq("created_by", userId);
    plannerItemsJoined = data ?? [];
  }

  const exportedAt = new Date().toISOString();

  return {
    export_version: 1,
    exported_at: exportedAt,
    user_id: userId,
    analytics_consent: analyticsConsent ?? null,
    account: {
      auth_email: authEmail ?? null,
      users: userRow.data ?? null,
    },
    profiles: {
      core: profilesCore.data ?? [],
      mode: profilesMode.data ?? [],
      business: profilesBusiness.data ?? [],
      sub_profiles: subProfiles.data ?? [],
    },
    matches: {
      romance_likes: romanceLikes.data ?? [],
      friends_requests: friendsRequests.data ?? [],
      business_connections: businessConnections.data ?? [],
    },
    messaging: {
      conversations,
      conversation_members: conversationMembers,
      conversation_member_settings: memberSettings.data ?? [],
      messages_sent: messagesSent,
      messages_metadata: messagesMetadata,
    },
    planner: {
      items_created: plannerItemsCreated.data ?? [],
      items_joined: plannerItemsJoined,
      participants: plannerParticipants.data ?? [],
    },
    wishlist: wishlistItems.data ?? [],
    preferences: userPreferences.data ?? [],
    blocks: userBlocks.data ?? [],
    events: {
      created: eventsCreated.data ?? [],
      participations: eventParticipants.data ?? [],
    },
    ai_usage: aiRequests.data ?? [],
  };
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
  const { data: { user }, error: userError } = await userClient.auth.getUser(
    authHeader.replace("Bearer ", ""),
  );
  if (userError || !user?.id) {
    return withCorsJson(req, { error: "Invalid or expired session" }, { status: 401 });
  }

  let body: ExportAccountRequest = {};
  try {
    body = (await req.json()) as ExportAccountRequest;
  } catch {
    body = {};
  }

  const userId = user.id;
  const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: userMeta, error: metaError } = await admin
      .from("users")
      .select("last_export_at")
      .eq("id", userId)
      .maybeSingle();

    if (metaError) {
      console.error("last_export_at lookup error:", metaError);
      return withCorsJson(req, { error: "Export failed" }, { status: 500 });
    }

    if (isExportRateLimited(userMeta?.last_export_at)) {
      const hours = hoursUntilNextExport(userMeta?.last_export_at) ?? EXPORT_RATE_LIMIT_HOURS;
      return withCorsJson(req, {
        error: "Rate limit exceeded",
        retry_after_hours: hours,
      }, { status: 429 });
    }

    const exportPayload = await collectUserExport(
      admin,
      userId,
      user.email,
      body.analytics_consent,
    );

    const objectPath = `${userId}/${exportPayload.exported_at.replace(/[:.]/g, "-")}.json`;
    const jsonBytes = new TextEncoder().encode(JSON.stringify(exportPayload, null, 2));

    const { error: uploadError } = await admin.storage
      .from(EXPORT_BUCKET)
      .upload(objectPath, jsonBytes, {
        contentType: "application/json",
        upsert: true,
      });

    if (uploadError) {
      console.error("export upload error:", uploadError);
      return withCorsJson(req, { error: "Export failed" }, { status: 500 });
    }

    const { data: signed, error: signError } = await admin.storage
      .from(EXPORT_BUCKET)
      .createSignedUrl(objectPath, SIGNED_URL_EXPIRES_SECONDS);

    if (signError || !signed?.signedUrl) {
      console.error("signed URL error:", signError);
      return withCorsJson(req, { error: "Export failed" }, { status: 500 });
    }

    const now = new Date().toISOString();
    const { error: updateError } = await admin
      .from("users")
      .update({ last_export_at: now, updated_at: now })
      .eq("id", userId);

    if (updateError) {
      console.error("last_export_at update error:", updateError);
    }

    const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRES_SECONDS * 1000).toISOString();

    return withCorsJson(req, {
      ok: true,
      url: signed.signedUrl,
      expires_at: expiresAt,
      expires_in_seconds: SIGNED_URL_EXPIRES_SECONDS,
    }, { status: 200 });
  } catch (err) {
    console.error("export-account error:", err);
    return withCorsJson(req, { error: "Export failed" }, { status: 500 });
  }
});
