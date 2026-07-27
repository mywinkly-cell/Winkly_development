// apps/mobile/lib/wishlistStore.ts
// Wishlist CRUD backed by Supabase public.wishlist_items.
//
// Requires migration 20260726120000_wishlist_places_and_shared_plans.sql, which
// promotes url/price to real columns and adds the place fields. Before that
// migration these columns do not exist and every select here fails.
//
// Historical note: url and price used to be smuggled into `description` as an
// HTML comment because the columns were missing. The migration backfills them
// out; decodeLegacyDescription below stays as a read-side fallback for any row
// the backfill skipped (unparseable payload).

import { supabase } from "@/lib/supabase";
import type { AppMode } from "@/types/database";

/** Where a wishlist entry was captured from. Mirrors the DB CHECK constraint. */
export type WishlistSource =
  | "manual"
  | "plan"
  | "venue_card"
  | "link"
  | "share"
  | "weekly_spark";

export type WishlistItem = {
  id: string;
  title: string;
  description?: string;
  url?: string;
  price?: string;
  mode: AppMode;
  /** Google Places id when the save came from a verified venue. */
  placeId?: string;
  address?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  /** The reel / article / page the idea came from. */
  sourceUrl?: string;
  imageUrl?: string;
  savedFrom: WishlistSource;
  /** Set when the user marks the wish as fulfilled. */
  visitedAt?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

const SELECT_COLUMNS =
  "id, title, description, url, price, mode, place_id, address, city, country, " +
  "latitude, longitude, source_url, image_url, saved_from, visited_at, archived_at, " +
  "created_at, updated_at";

const LEGACY_META_SUFFIX = "\n<!--winkly-wishlist-meta:";

/** Read-side fallback for rows the migration backfill could not parse. */
function decodeLegacyDescription(raw: string | null | undefined): {
  description: string;
  url: string;
  price: string;
} {
  if (!raw) return { description: "", url: "", price: "" };
  const idx = raw.indexOf(LEGACY_META_SUFFIX);
  if (idx < 0) return { description: raw, url: "", price: "" };
  const description = raw.slice(0, idx).trimEnd();
  const tail = raw.slice(idx + LEGACY_META_SUFFIX.length);
  const end = tail.indexOf("-->");
  if (end < 0) return { description: raw, url: "", price: "" };
  try {
    const meta = JSON.parse(tail.slice(0, end)) as { url?: string; price?: string };
    return {
      description,
      url: meta.url?.trim() ?? "",
      price: meta.price?.trim() ?? "",
    };
  } catch {
    return { description: raw, url: "", price: "" };
  }
}

type WishlistRow = {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  price: string | null;
  mode: AppMode;
  place_id: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  source_url: string | null;
  image_url: string | null;
  saved_from: WishlistSource | null;
  visited_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: WishlistRow): WishlistItem {
  const legacy = decodeLegacyDescription(row.description);
  return {
    id: row.id,
    title: row.title,
    description: (row.url || row.price ? row.description ?? "" : legacy.description) || undefined,
    url: row.url ?? legacy.url ?? undefined,
    price: row.price ?? legacy.price ?? undefined,
    mode: row.mode,
    placeId: row.place_id ?? undefined,
    address: row.address ?? undefined,
    city: row.city ?? undefined,
    country: row.country ?? undefined,
    latitude: typeof row.latitude === "number" ? row.latitude : undefined,
    longitude: typeof row.longitude === "number" ? row.longitude : undefined,
    sourceUrl: row.source_url ?? undefined,
    imageUrl: row.image_url ?? undefined,
    savedFrom: row.saved_from ?? "manual",
    visitedAt: row.visited_at ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const uid = data?.user?.id;
  if (!uid) throw new Error("Sign in to manage your wishlist.");
  return uid;
}

export type ListWishlistOptions = {
  mode?: AppMode;
  /** Include entries already marked visited (default false). */
  includeVisited?: boolean;
  /** Include archived entries (default false). */
  includeArchived?: boolean;
};

export async function listWishlistItems(
  modeOrOptions?: AppMode | ListWishlistOptions
): Promise<WishlistItem[]> {
  const opts: ListWishlistOptions =
    typeof modeOrOptions === "string" ? { mode: modeOrOptions } : modeOrOptions ?? {};

  const uid = await requireUserId();
  let query = supabase
    .from("wishlist_items")
    .select(SELECT_COLUMNS)
    .eq("user_id", uid)
    .order("updated_at", { ascending: false });

  if (opts.mode) query = query.eq("mode", opts.mode);
  if (!opts.includeVisited) query = query.is("visited_at", null);
  if (!opts.includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as unknown as WishlistRow));
}

export async function getWishlistItem(id: string): Promise<WishlistItem | null> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from("wishlist_items")
    .select(SELECT_COLUMNS)
    .eq("user_id", uid)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapRow(data as unknown as WishlistRow);
}

export type CreateWishlistInput = {
  title: string;
  description?: string;
  url?: string;
  price?: string;
  mode?: AppMode;
  placeId?: string;
  address?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  sourceUrl?: string;
  imageUrl?: string;
  savedFrom?: WishlistSource;
};

export async function createWishlistItem(input: CreateWishlistInput): Promise<WishlistItem> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from("wishlist_items")
    .insert({
      user_id: uid,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      url: input.url?.trim() || null,
      price: input.price?.trim() || null,
      mode: input.mode ?? "romance",
      place_id: input.placeId?.trim() || null,
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      country: input.country?.trim() || null,
      latitude: typeof input.latitude === "number" ? input.latitude : null,
      longitude: typeof input.longitude === "number" ? input.longitude : null,
      source_url: input.sourceUrl?.trim() || null,
      image_url: input.imageUrl?.trim() || null,
      saved_from: input.savedFrom ?? "manual",
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) throw error;
  return mapRow(data as unknown as WishlistRow);
}

export type UpdateWishlistPatch = Partial<
  Pick<
    WishlistItem,
    | "title"
    | "description"
    | "url"
    | "price"
    | "placeId"
    | "address"
    | "city"
    | "country"
    | "latitude"
    | "longitude"
    | "sourceUrl"
    | "imageUrl"
  >
>;

export async function updateWishlistItem(
  id: string,
  patch: UpdateWishlistPatch
): Promise<WishlistItem | null> {
  const uid = await requireUserId();

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title.trim();
  if (patch.description !== undefined) row.description = patch.description?.trim() || null;
  if (patch.url !== undefined) row.url = patch.url?.trim() || null;
  if (patch.price !== undefined) row.price = patch.price?.trim() || null;
  if (patch.placeId !== undefined) row.place_id = patch.placeId?.trim() || null;
  if (patch.address !== undefined) row.address = patch.address?.trim() || null;
  if (patch.city !== undefined) row.city = patch.city?.trim() || null;
  if (patch.country !== undefined) row.country = patch.country?.trim() || null;
  if (patch.latitude !== undefined) row.latitude = patch.latitude ?? null;
  if (patch.longitude !== undefined) row.longitude = patch.longitude ?? null;
  if (patch.sourceUrl !== undefined) row.source_url = patch.sourceUrl?.trim() || null;
  if (patch.imageUrl !== undefined) row.image_url = patch.imageUrl?.trim() || null;

  const { data, error } = await supabase
    .from("wishlist_items")
    .update(row)
    .eq("user_id", uid)
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapRow(data as unknown as WishlistRow);
}

/**
 * Mark a wish as fulfilled. Kept rather than deleted so Weekly Spark can avoid
 * re-suggesting it, and so the user can see what they've actually done.
 */
export async function markWishlistItemVisited(
  id: string,
  visited = true
): Promise<WishlistItem | null> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from("wishlist_items")
    .update({
      visited_at: visited ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", uid)
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapRow(data as unknown as WishlistRow);
}

export async function archiveWishlistItem(id: string, archived = true): Promise<boolean> {
  const uid = await requireUserId();
  const { error } = await supabase
    .from("wishlist_items")
    .update({
      archived_at: archived ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", uid)
    .eq("id", id);

  if (error) throw error;
  return true;
}

export async function deleteWishlistItem(id: string): Promise<boolean> {
  const uid = await requireUserId();
  const { error, count } = await supabase
    .from("wishlist_items")
    .delete({ count: "exact" })
    .eq("user_id", uid)
    .eq("id", id);

  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * Save a place straight from a plan option or venue card — the one-tap path that
 * makes the wishlist worth having. Deduplicates on place_id so tapping twice on
 * the same venue does not create a second entry.
 */
export async function saveVenueToWishlist(input: {
  title: string;
  mode: AppMode;
  placeId?: string;
  address?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  sourceUrl?: string;
  savedFrom?: WishlistSource;
}): Promise<{ item: WishlistItem; alreadySaved: boolean }> {
  const uid = await requireUserId();

  if (input.placeId) {
    const { data: existing } = await supabase
      .from("wishlist_items")
      .select(SELECT_COLUMNS)
      .eq("user_id", uid)
      .eq("place_id", input.placeId)
      .is("archived_at", null)
      .maybeSingle();
    if (existing) return { item: mapRow(existing as unknown as WishlistRow), alreadySaved: true };
  }

  const item = await createWishlistItem({
    ...input,
    savedFrom: input.savedFrom ?? "venue_card",
  });
  return { item, alreadySaved: false };
}
