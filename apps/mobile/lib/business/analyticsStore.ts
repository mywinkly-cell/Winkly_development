import { supabase } from "@/lib/supabase";

export type BusinessAnalyticsEventType =
  | "profile_view"
  | "offer_impression"
  | "offer_click"
  | "invite_sent"
  | "invite_accepted";

export type BusinessAnalyticsSummary = {
  profileViews: number;
  offerImpressions: number;
  offerClicks: number;
  invitesSent: number;
  invitesAccepted: number;
  activeOffers: number;
  sponsoredOffers: number;
};

export async function recordBusinessAnalyticsEvent(p: {
  businessId: string;
  eventType: BusinessAnalyticsEventType;
  viewerId?: string | null;
  offerId?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.from("business_analytics_events").insert({
    business_id: p.businessId,
    event_type: p.eventType,
    viewer_id: p.viewerId ?? null,
    offer_id: p.offerId ?? null,
    meta: p.meta ?? {},
  });
  if (error) console.warn("[business analytics]", error.message);
}

export async function getBusinessAnalyticsSummary(
  businessId: string
): Promise<BusinessAnalyticsSummary> {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceIso = since.toISOString();

  const [eventsRes, offersRes] = await Promise.all([
    supabase
      .from("business_analytics_events")
      .select("event_type")
      .eq("business_id", businessId)
      .gte("created_at", sinceIso),
    supabase
      .from("business_offers")
      .select("id, is_sponsored, sponsored_until")
      .eq("business_id", businessId),
  ]);

  const counts: BusinessAnalyticsSummary = {
    profileViews: 0,
    offerImpressions: 0,
    offerClicks: 0,
    invitesSent: 0,
    invitesAccepted: 0,
    activeOffers: 0,
    sponsoredOffers: 0,
  };

  for (const row of eventsRes.data ?? []) {
    const t = String(row.event_type);
    if (t === "profile_view") counts.profileViews += 1;
    else if (t === "offer_impression") counts.offerImpressions += 1;
    else if (t === "offer_click") counts.offerClicks += 1;
    else if (t === "invite_sent") counts.invitesSent += 1;
    else if (t === "invite_accepted") counts.invitesAccepted += 1;
  }

  const now = Date.now();
  for (const offer of offersRes.data ?? []) {
    counts.activeOffers += 1;
    if (offer.is_sponsored) {
      const until = offer.sponsored_until ? new Date(String(offer.sponsored_until)).getTime() : null;
      if (!until || until > now) counts.sponsoredOffers += 1;
    }
  }

  return counts;
}
