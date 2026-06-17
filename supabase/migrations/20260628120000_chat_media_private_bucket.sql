-- Storage: move chat media (images + voice notes) into a PRIVATE bucket.
--
-- Why: chat images and voice notes were uploaded to the PUBLIC user-photos /
-- user-videos buckets and referenced by permanent getPublicUrl() links. Anyone
-- with (or guessing) the URL could fetch private/intimate conversation media with
-- no auth check. This bucket is private: only members of the conversation the
-- media belongs to can read it, and the app renders it via short-lived signed
-- URLs (apps/mobile/lib/chats/chatMedia.ts).
--
-- Profile/discovery photos intentionally stay PUBLIC in user-photos/user-videos —
-- they are shown to many users in feeds and must remain directly renderable.
--
-- Path convention: `{senderUserId}/{conversationId}/{filename}`
--   * segment [1] = uploader id  → owner-scoped writes + GDPR erasure by `{userId}/` prefix
--   * segment [2] = conversation id → reads gated on active conversation membership
--
-- Paired app/function changes:
--   * apps/mobile/lib/uploadMedia.ts            → uploads here, returns a storage path
--   * apps/mobile/lib/chats/chatMedia.ts        → signs paths → short-lived URLs
--   * apps/mobile/lib/chats/hooks.ts            → hydrates signed URLs on fetch/realtime
--   * supabase/functions/delete-account/index.ts → includes this bucket in erasure

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Private bucket (idempotent). public = false → no anonymous reads.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media', 'chat-media', false, 52428800,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime',
    'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/x-m4a'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS on storage.objects for chat-media.
--    Read: any active member of the conversation in path segment [2].
--    Write: the owner (segment [1] = auth.uid()) who is also an active member.
--    The service role (Edge Functions, account deletion) bypasses RLS.
-- ─────────────────────────────────────────────────────────────────────────────

-- Read: members of the conversation may read (and therefore mint signed URLs for) its media.
DROP POLICY IF EXISTS chat_media_member_read ON storage.objects;
CREATE POLICY chat_media_member_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = ((storage.foldername(name))[2])::uuid
        AND cm.user_id = auth.uid()
        AND cm.left_at IS NULL
    )
  );

-- Insert: a user may only upload into their own folder, and only for a conversation
-- they are an active member of.
DROP POLICY IF EXISTS chat_media_owner_insert ON storage.objects;
CREATE POLICY chat_media_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = ((storage.foldername(name))[2])::uuid
        AND cm.user_id = auth.uid()
        AND cm.left_at IS NULL
    )
  );

-- Update/Delete: owner only (mirrors message immutability — moderation/erasure use the service role).
DROP POLICY IF EXISTS chat_media_owner_update ON storage.objects;
CREATE POLICY chat_media_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'chat-media' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'chat-media' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS chat_media_owner_delete ON storage.objects;
CREATE POLICY chat_media_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'chat-media' AND (storage.foldername(name))[1] = auth.uid()::text);
