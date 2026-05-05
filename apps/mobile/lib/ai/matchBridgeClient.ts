/**
 * Match Bridge — calls ai-gateway task match_bridge after a romance match.
 * Uses device daytime free slots + server-side planner + profiles (dietary, location).
 */

import { supabase } from "@/lib/supabase";
import { sendMessage } from "@/lib/chats/api";
import type { Message } from "@/lib/chats/types";
import { getFreeDaytimeSlotsForBridge } from "@/lib/ai/conciergeCalendar";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

function aiGatewayHeaders(accessToken: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
  if (SUPABASE_ANON_KEY) h.apikey = SUPABASE_ANON_KEY;
  return h;
}

export type MatchBridgePayload = {
  bridge_message: string;
  proposed_starts_at: string;
  proposed_ends_at?: string | null;
  venue_name: string;
  location_hint?: string;
  activity_theme?: string;
  disclaimer?: string;
};

export type MatchBridgeApiResponse = {
  match_bridge?: MatchBridgePayload;
  message?: string;
  request_id?: string | null;
  error?: string;
};

export async function callMatchBridge(params: {
  partnerUserId: string;
  city?: string;
  country?: string;
  primary_free_slots?: string[];
}): Promise<MatchBridgeApiResponse> {
  if (!SUPABASE_URL) {
    return { error: "Missing Supabase URL" };
  }
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    return { error: "Not signed in" };
  }

  const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/ai-gateway`;
  const slots = params.primary_free_slots ?? (await getFreeDaytimeSlotsForBridge());

  let city = params.city;
  if (!city) {
    const uid = session.user.id;
    const { data: core } = await supabase.from("profiles_core").select("city").eq("id", uid).maybeSingle();
    city = (core as { city?: string } | null)?.city ?? undefined;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: aiGatewayHeaders(session.access_token),
      body: JSON.stringify({
        mode: "romance",
        task: "match_bridge",
        context: {
          mode: "romance",
          partner_user_id: params.partnerUserId,
          city: city ?? undefined,
          country: params.country,
          primary_free_slots: slots,
          partner_free_slots: [],
        },
      }),
    });

    const json = (await res.json()) as MatchBridgeApiResponse;
    if (!res.ok) {
      return { error: (json as { error?: string }).error ?? `HTTP ${res.status}` };
    }
    return json;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Network error" };
  }
}

/**
 * Fetches Match Bridge copy from ai-gateway and posts a CTA message to the match chat.
 * Returns true if a message was sent.
 */
export async function postMatchBridgeCtaMessage(params: {
  conversationId: string;
  partnerUserId: string;
}): Promise<{ ok: true; inserted: Message } | { ok: false }> {
  const res = await callMatchBridge({ partnerUserId: params.partnerUserId });
  const bridge = res.match_bridge;
  if (!bridge?.bridge_message || !bridge.proposed_starts_at) {
    return { ok: false };
  }
  const { data: { session } } = await supabase.auth.getSession();
  const meId = session?.user?.id;
  if (!meId) return { ok: false };

  const startsAt = bridge.proposed_starts_at;
  const endsAt =
    bridge.proposed_ends_at ??
    new Date(new Date(startsAt).getTime() + 90 * 60 * 1000).toISOString();

  const payload = {
    type: "match_bridge" as const,
    bridge_message: bridge.bridge_message,
    title: bridge.venue_name,
    place: bridge.venue_name,
    location: bridge.location_hint ?? null,
    starts_at: startsAt,
    ends_at: endsAt,
    disclaimer: bridge.disclaimer ?? null,
    activity_theme: bridge.activity_theme ?? "coffee",
  };

  const inserted = await sendMessage(params.conversationId, meId, JSON.stringify(payload), [], { messageType: "cta" });
  return { ok: true, inserted };
}
