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
    .select(
      "id, business_id, title, description, image_url, booking_url, category_tags, valid_from, valid_to, radius_km, budget_cents, is_active, city, created_at"
    )
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

export async function listOwnBusinessOffers(businessId: string): Promise<BusinessOfferRow[]> {
  const { data, error } = await supabase
    .from("business_offers")
    .select(
      "id, business_id, title, description, image_url, booking_url, category_tags, valid_from, valid_to, radius_km, budget_cents, is_active, city, created_at"
    )
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
