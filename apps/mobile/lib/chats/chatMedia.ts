// apps/mobile/lib/chats/chatMedia.ts
//
// Signed-URL resolution for private chat media.
//
// Chat images and voice notes live in the PRIVATE `chat-media` bucket (see
// supabase/migrations/20260628120000_chat_media_private_bucket.sql). They are
// referenced on messages by a durable storage `path`; there is no public URL.
// To display them we mint short-lived signed URLs, which Supabase only issues to
// callers who pass the bucket's RLS (i.e. active members of the conversation).
//
// Signing happens in the data layer (lib/chats/hooks.ts) on fetch + realtime, so
// the render layer keeps reading `attachment.url` unchanged.

import { supabase } from "@/lib/supabase";
import type { Message } from "./types";

export const CHAT_MEDIA_BUCKET = "chat-media";

// Signed URLs are re-minted on every fetch / realtime event and on pagination,
// so a few hours comfortably covers a viewing session while keeping any leaked
// URL short-lived.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 4;

/** Mint a signed URL for one chat-media path (used right after upload for optimistic display). */
export async function signChatMediaPath(path: string): Promise<string> {
  try {
    const { data } = await supabase.storage
      .from(CHAT_MEDIA_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    return data?.signedUrl ?? "";
  } catch {
    return "";
  }
}

/**
 * Resolve private chat-media storage paths to short-lived signed URLs.
 *
 * Returns copies of the affected messages with `attachment.url` populated from
 * the signed URL. Attachments without a `path` (GIFs, external/legacy URLs,
 * optimistic local uris) are left untouched. A no-op (no network) for text-only
 * messages, so it is cheap to call on every fetch and realtime event.
 */
export async function hydrateChatMediaUrls(messages: Message[]): Promise<Message[]> {
  const paths = new Set<string>();
  for (const m of messages) {
    for (const a of m.attachments ?? []) {
      if (a?.path) paths.add(a.path);
    }
  }
  if (paths.size === 0) return messages;

  const signed = new Map<string, string>();
  try {
    const { data, error } = await supabase.storage
      .from(CHAT_MEDIA_BUCKET)
      .createSignedUrls(Array.from(paths), SIGNED_URL_TTL_SECONDS);
    if (!error && data) {
      for (const row of data) {
        if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl);
      }
    }
  } catch {
    // Network/permission failure → leave urls as-is rather than blocking the chat.
    return messages;
  }
  if (signed.size === 0) return messages;

  return messages.map((m) => {
    if (!m.attachments?.some((a) => a?.path && signed.has(a.path))) return m;
    return {
      ...m,
      attachments: m.attachments.map((a) =>
        a?.path && signed.has(a.path) ? { ...a, url: signed.get(a.path) as string } : a
      ),
    };
  });
}
