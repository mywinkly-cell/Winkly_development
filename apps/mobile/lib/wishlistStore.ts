// apps/mobile/lib/wishlistStore.ts
// Minimal in-memory Wishlist store (MVP-safe).
// Later: replace with Supabase table: wishlists + wishlist_items.

export type WishlistItem = {
  id: string;
  title: string;
  description?: string;
  url?: string;
  price?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

const nowIso = () => new Date().toISOString();
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

let items: WishlistItem[] = [
  {
    id: uid(),
    title: "Weekend spa gift card",
    description: "Relaxing spa day (placeholder item).",
    url: "",
    price: "€150",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: uid(),
    title: "Elegant coffee machine",
    description: "Premium design, compact size.",
    url: "https://example.com",
    price: "€220",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
];

export function listWishlistItems(): WishlistItem[] {
  return [...items].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function getWishlistItem(id: string): WishlistItem | null {
  return items.find((x) => x.id === id) ?? null;
}

export function createWishlistItem(input: {
  title: string;
  description?: string;
  url?: string;
  price?: string;
}): WishlistItem {
  const created = {
    id: uid(),
    title: input.title.trim(),
    description: input.description?.trim() || "",
    url: input.url?.trim() || "",
    price: input.price?.trim() || "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  items = [created, ...items];
  return created;
}

export function updateWishlistItem(
  id: string,
  patch: Partial<Pick<WishlistItem, "title" | "description" | "url" | "price">>
): WishlistItem | null {
  const existing = getWishlistItem(id);
  if (!existing) return null;

  const updated: WishlistItem = {
    ...existing,
    title: patch.title !== undefined ? patch.title.trim() : existing.title,
    description:
      patch.description !== undefined ? patch.description.trim() : existing.description,
    url: patch.url !== undefined ? patch.url.trim() : existing.url,
    price: patch.price !== undefined ? patch.price.trim() : existing.price,
    updatedAt: nowIso(),
  };

  items = items.map((x) => (x.id === id ? updated : x));
  return updated;
}

export function deleteWishlistItem(id: string): boolean {
  const before = items.length;
  items = items.filter((x) => x.id !== id);
  return items.length !== before;
}
