// apps/mobile/lib/wishlistStore.ts
// Wishlist CRUD backed by Supabase public.wishlist_items.

import { supabase } from "@/lib/supabase";
import type { AppMode } from "@/types/database";

export type WishlistItem = {
  id: string;
  title: string;
  description?: string;
  url?: string;
  price?: string;
  mode: AppMode;
  createdAt: string;
  updatedAt: string;
};

const META_SUFFIX = "\n<!--winkly-wishlist-meta:";

type WishlistMeta = { url?: string; price?: string };

function encodeDescription(description: string | undefined, url?: string, price?: string): string | null {
  const base = description?.trim() ?? "";
  const meta: WishlistMeta = {};
  const cleanUrl = url?.trim();
  const cleanPrice = price?.trim();
  if (cleanUrl) meta.url = cleanUrl;
  if (cleanPrice) meta.price = cleanPrice;
  if (!Object.keys(meta).length) return base || null;
  return `${base}${META_SUFFIX}${JSON.stringify(meta)}-->`;
}

function decodeDescription(raw: string | null | undefined): { description: string; url: string; price: string } {
  if (!raw) return { description: "", url: "", price: "" };
  const idx = raw.indexOf(META_SUFFIX);
  if (idx < 0) return { description: raw, url: "", price: "" };
  const description = raw.slice(0, idx).trimEnd();
  const tail = raw.slice(idx + META_SUFFIX.length);
  const end = tail.indexOf("-->");
  if (end < 0) return { description: raw, url: "", price: "" };
  try {
    const meta = JSON.parse(tail.slice(0, end)) as WishlistMeta;
    return {
      description,
      url: meta.url?.trim() ?? "",
      price: meta.price?.trim() ?? "",
    };
  } catch {
    return { description: raw, url: "", price: "" };
  }
}

function mapRow(row: {
  id: string;
  title: string;
  description: string | null;
  mode: AppMode;
  created_at: string;
  updated_at: string;
}): WishlistItem {
  const decoded = decodeDescription(row.description);
  return {
    id: row.id,
    title: row.title,
    description: decoded.description || undefined,
    url: decoded.url || undefined,
    price: decoded.price || undefined,
    mode: row.mode,
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

export async function listWishlistItems(mode?: AppMode): Promise<WishlistItem[]> {
  const uid = await requireUserId();
  let query = supabase
    .from("wishlist_items")
    .select("id, title, description, mode, created_at, updated_at")
    .eq("user_id", uid)
    .order("updated_at", { ascending: false });

  if (mode) query = query.eq("mode", mode);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as Parameters<typeof mapRow>[0]));
}

export async function getWishlistItem(id: string): Promise<WishlistItem | null> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from("wishlist_items")
    .select("id, title, description, mode, created_at, updated_at")
    .eq("user_id", uid)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapRow(data as Parameters<typeof mapRow>[0]);
}

export async function createWishlistItem(input: {
  title: string;
  description?: string;
  url?: string;
  price?: string;
  mode?: AppMode;
}): Promise<WishlistItem> {
  const uid = await requireUserId();
  const mode = input.mode ?? "romance";
  const { data, error } = await supabase
    .from("wishlist_items")
    .insert({
      user_id: uid,
      title: input.title.trim(),
      description: encodeDescription(input.description, input.url, input.price),
      mode,
    })
    .select("id, title, description, mode, created_at, updated_at")
    .single();

  if (error) throw error;
  return mapRow(data as Parameters<typeof mapRow>[0]);
}

export async function updateWishlistItem(
  id: string,
  patch: Partial<Pick<WishlistItem, "title" | "description" | "url" | "price">>
): Promise<WishlistItem | null> {
  const existing = await getWishlistItem(id);
  if (!existing) return null;

  const title = patch.title !== undefined ? patch.title.trim() : existing.title;
  const description =
    patch.description !== undefined ? patch.description : existing.description ?? "";
  const url = patch.url !== undefined ? patch.url : existing.url ?? "";
  const price = patch.price !== undefined ? patch.price : existing.price ?? "";

  const uid = await requireUserId();
  const { data, error } = await supabase
    .from("wishlist_items")
    .update({
      title,
      description: encodeDescription(description, url, price),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", uid)
    .eq("id", id)
    .select("id, title, description, mode, created_at, updated_at")
    .single();

  if (error) throw error;
  return mapRow(data as Parameters<typeof mapRow>[0]);
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
