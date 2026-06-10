import { ACTIVITY_PREFERENCE_OPTIONS } from "@/constants/profileOptions";
import { supabase } from "@/lib/supabase";

export type BusinessOfferRow = {
  id: string;
  business_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  booking_url: string | null;
  category_tags: string[];
  valid_from: string | null;
  valid_to: string | null;
  radius_km: number | null;
  budget_cents: number;
  is_active: boolean;
  city: string | null;
  created_at: string;
};

const OFFER_SELECT_COLUMNS =
  "id, business_id, title, description, image_url, booking_url, category_tags, valid_from, valid_to, radius_km, budget_cents, is_active, city, created_at";

export type BusinessOfferDraft = {
  title: string;
  description: string;
  image_url: string | null;
  booking_url: string;
  category_tags: string[];
  valid_from: string | null;
  valid_to: string | null;
  radius_km: number | null;
  budget_cents: number;
};

export async function listActiveBusinessOffers(limit = 12): Promise<BusinessOfferRow[]> {
  const { data, error } = await supabase
    .from("business_offers")
    .select(OFFER_SELECT_COLUMNS)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(limit * 3);
  if (error) {
    console.warn("[business offers]", error.message);
    return [];
  }
  const now = Date.now();
  return ((data ?? []) as BusinessOfferRow[])
    .filter((row) => {
      if (row.valid_from && new Date(row.valid_from).getTime() > now) return false;
      if (row.valid_to && new Date(row.valid_to).getTime() < now) return false;
      return true;
    })
    .slice(0, limit);
}

export type BusinessOfferDisplayStatus = "active" | "scheduled" | "expired" | "inactive";

export function getBusinessOfferDisplayStatus(
  offer: BusinessOfferRow,
  now = Date.now()
): BusinessOfferDisplayStatus {
  if (!offer.is_active) return "inactive";
  const from = offer.valid_from ? new Date(offer.valid_from).getTime() : null;
  const to = offer.valid_to ? new Date(offer.valid_to).getTime() : null;
  if (from != null && from > now) return "scheduled";
  if (to != null && to < now) return "expired";
  return "active";
}

export function isBusinessOfferDashboardVisible(offer: BusinessOfferRow): boolean {
  const status = getBusinessOfferDisplayStatus(offer);
  return status === "active" || status === "scheduled";
}

function formatOfferShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function categoryLabelForTag(tag: string): string {
  return ACTIVITY_PREFERENCE_OPTIONS.find((option) => option.key === tag)?.label ?? tag.replace(/_/g, " ");
}

export function formatBusinessOfferSummaryLine(offer: BusinessOfferRow, now = Date.now()): string {
  const parts: string[] = [];
  if (offer.category_tags.length > 0) {
    parts.push(offer.category_tags.map(categoryLabelForTag).join(" / "));
  }
  if (offer.radius_km != null) {
    parts.push(`${offer.radius_km} km radius`);
  }
  const status = getBusinessOfferDisplayStatus(offer, now);
  if (status === "scheduled" && offer.valid_from) {
    parts.push(`starts ${formatOfferShortDate(offer.valid_from)}`);
  } else if (offer.valid_to) {
    parts.push(`ends ${formatOfferShortDate(offer.valid_to)}`);
  }
  return parts.join(" · ");
}

export async function listOwnBusinessOffers(businessId: string): Promise<BusinessOfferRow[]> {
  const { data, error } = await supabase
    .from("business_offers")
    .select(OFFER_SELECT_COLUMNS)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[business offers]", error.message);
    return [];
  }
  return (data ?? []) as BusinessOfferRow[];
}

export async function createBusinessOffer(
  businessId: string,
  draft: BusinessOfferDraft,
  city: string | null
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase
    .from("business_offers")
    .insert({
      business_id: businessId,
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      image_url: draft.image_url,
      booking_url: draft.booking_url.trim() || null,
      category_tags: draft.category_tags,
      valid_from: draft.valid_from,
      valid_to: draft.valid_to,
      radius_km: draft.radius_km,
      budget_cents: draft.budget_cents,
      is_active: true,
      city,
      is_sponsored: draft.budget_cents > 0,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: String(data.id) };
}
