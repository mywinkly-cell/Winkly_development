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

/** Modes a saved place can be shared in (Identity Firewall: sharing is per mode). */
export type ShareableMode = "romance" | "friends" | "business";
export const SHAREABLE_MODES: readonly ShareableMode[] = ["romance", "friends", "business"] as const;

function toShareableModes(v: unknown): ShareableMode[] {
  return Array.isArray(v) ? (v.filter((m) => SHAREABLE_MODES.includes(m as ShareableMode)) as ShareableMode[]) : [];
}

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
  /** Modes this place is shared in (visible to people you chat with in that mode). Empty = private. */
  sharedModes: ShareableMode[];
  /** Set when the user marks the wish as fulfilled. */
  visitedAt?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

const SELECT_COLUMNS =
  "id, title, description, url, price, mode, place_id, address, city, country, " +
  "latitude, longitude, source_url, image_url, saved_from, shared_modes, visited_at, archived_at, " +
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
  shared_modes: string[] | null;
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
    sharedModes: toShareableModes(row.shared_modes),
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
  sharedModes?: ShareableMode[];
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
      shared_modes: input.sharedModes ?? [],
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
    | "sharedModes"
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
  if (patch.sharedModes !== undefined) row.shared_modes = patch.sharedModes;

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

// ── Sharing the whole list ───────────────────────────────────────────────────

/** Modes in which the WHOLE wishlist (current and future places) is shared. */
export async function getWishlistShareAllModes(): Promise<ShareableMode[]> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from("wishlist_sharing_settings")
    .select("share_all_modes")
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw error;
  return toShareableModes((data as { share_all_modes?: unknown } | null)?.share_all_modes);
}

export async function setWishlistShareAllModes(modes: ShareableMode[]): Promise<void> {
  const uid = await requireUserId();
  const { error } = await supabase
    .from("wishlist_sharing_settings")
    .upsert({ user_id: uid, share_all_modes: modes, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
}

export type SharedWishlistItem = {
  ownerId: string;
  id: string;
  title: string;
  description?: string;
  address?: string;
  city?: string;
  placeId?: string;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  url?: string;
  price?: string;
};

/**
 * Places other people shared with you in `mode` (only people you have an active chat with
 * in that mode — enforced by the get_shared_wishlist_items RPC).
 */
export async function listSharedWishlistItems(ownerIds: string[], mode: ShareableMode): Promise<SharedWishlistItem[]> {
  const ids = Array.from(new Set(ownerIds.filter(Boolean))).slice(0, 8);
  if (ids.length === 0) return [];
  const { data, error } = await supabase.rpc("get_shared_wishlist_items", { p_owner_ids: ids, p_mode: mode });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ownerId: String(r.owner_id),
    id: String(r.item_id),
    title: String(r.title ?? ""),
    description: (r.description as string | null) ?? undefined,
    address: (r.address as string | null) ?? undefined,
    city: (r.city as string | null) ?? undefined,
    placeId: (r.place_id as string | null) ?? undefined,
    latitude: typeof r.latitude === "number" ? r.latitude : undefined,
    longitude: typeof r.longitude === "number" ? r.longitude : undefined,
    imageUrl: (r.image_url as string | null) ?? undefined,
    url: (r.url as string | null) ?? undefined,
    price: (r.price as string | null) ?? undefined,
  }));
}

// ── Sharing with specific people ─────────────────────────────────────────────

/** Someone the user can share places with: a person they have a 1:1 chat with. */
export type ShareCandidate = {
  userId: string;
  firstName: string | null;
  photoUrl: string | null;
  modes: ShareableMode[];
};

export async function listShareCandidates(): Promise<ShareCandidate[]> {
  const { data, error } = await supabase.rpc("list_wishlist_share_candidates");
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    userId: String(r.user_id),
    firstName: (r.first_name as string | null) ?? null,
    photoUrl: (r.photo_url as string | null) ?? null,
    modes: toShareableModes(r.modes),
  }));
}

/** Who sees one place personally (itemId) or the whole list (null). */
export async function getWishlistViewers(itemId: string | null): Promise<string[]> {
  const uid = await requireUserId();
  let q = supabase.from("wishlist_item_viewers").select("viewer_id").eq("owner_id", uid);
  q = itemId ? q.eq("item_id", itemId) : q.is("item_id", null);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as { viewer_id: string }[]).map((r) => r.viewer_id);
}

/** Replace who sees one place (itemId) or the whole list (null). Only real connections are kept. */
export async function setWishlistViewers(itemId: string | null, viewerIds: string[]): Promise<number> {
  const { data, error } = await supabase.rpc("set_wishlist_viewers", {
    p_item_id: itemId,
    p_viewer_ids: Array.from(new Set(viewerIds)),
  });
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}

export type SharedWithMeItem = SharedWishlistItem & {
  ownerFirstName: string | null;
  ownerPhotoUrl: string | null;
};

/** Places other people shared with me (by mode or personally). */
export async function listWishlistSharedWithMe(): Promise<SharedWithMeItem[]> {
  const { data, error } = await supabase.rpc("get_wishlist_shared_with_me");
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ownerId: String(r.owner_id),
    ownerFirstName: (r.owner_first_name as string | null) ?? null,
    ownerPhotoUrl: (r.owner_photo_url as string | null) ?? null,
    id: String(r.item_id),
    title: String(r.title ?? ""),
    description: (r.description as string | null) ?? undefined,
    address: (r.address as string | null) ?? undefined,
    city: (r.city as string | null) ?? undefined,
    placeId: (r.place_id as string | null) ?? undefined,
    latitude: typeof r.latitude === "number" ? r.latitude : undefined,
    longitude: typeof r.longitude === "number" ? r.longitude : undefined,
    imageUrl: (r.image_url as string | null) ?? undefined,
    url: (r.url as string | null) ?? undefined,
    price: (r.price as string | null) ?? undefined,
  }));
}
