import { supabase } from "@/lib/supabase";

export type BusinessAnalyticsEventType =
  | "profile_view"
  | "offer_impression"
  | "offer_tap"
  | "add_to_planner";

export type BusinessAnalyticsPeriod = "week" | "month";

export type BusinessAnalyticsSummary = {
  profileViews: number;
  offerImpressions: number;
  offerTaps: number;
  addToPlanner: number;
};

export type BusinessAnalyticsMetadata = {
  viewer_id?: string;
  offer_id?: string;
  source?: string;
  planner_item_id?: string;
  [key: string]: unknown;
};

function periodStart(period: BusinessAnalyticsPeriod): string {
  const since = new Date();
  if (period === "week") {
    since.setDate(since.getDate() - 7);
  } else {
    since.setDate(since.getDate() - 30);
  }
  return since.toISOString();
}

export async function recordBusinessAnalyticsEvent(p: {
  businessId: string;
  eventType: BusinessAnalyticsEventType;
  metadata?: BusinessAnalyticsMetadata;
}): Promise<void> {
  const { error } = await supabase.rpc("record_business_analytics_event", {
    p_business_id: p.businessId,
    p_event_type: p.eventType,
    p_metadata: p.metadata ?? {},
  });
  if (error) {
    const { error: insertError } = await supabase.from("business_analytics_events").insert({
      business_id: p.businessId,
      event_type: p.eventType,
      metadata: p.metadata ?? {},
    });
    if (insertError) console.warn("[business analytics]", insertError.message);
  }
}

export async function getBusinessAnalyticsSummary(
  businessId: string,
  period: BusinessAnalyticsPeriod = "week"
): Promise<BusinessAnalyticsSummary> {
  const sinceIso = periodStart(period);

  const { data, error } = await supabase
    .from("business_analytics_events")
    .select("event_type")
    .eq("business_id", businessId)
    .gte("created_at", sinceIso);

  if (error) {
    console.warn("[business analytics]", error.message);
    return emptySummary();
  }

  const counts = emptySummary();
  for (const row of data ?? []) {
    const t = String(row.event_type);
    if (t === "profile_view") counts.profileViews += 1;
    else if (t === "offer_impression") counts.offerImpressions += 1;
    else if (t === "offer_tap" || t === "offer_click") counts.offerTaps += 1;
    else if (t === "add_to_planner") counts.addToPlanner += 1;
  }

  return counts;
}

function emptySummary(): BusinessAnalyticsSummary {
  return {
    profileViews: 0,
    offerImpressions: 0,
    offerTaps: 0,
    addToPlanner: 0,
  };
}
