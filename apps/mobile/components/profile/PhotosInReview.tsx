// apps/mobile/components/profile/PhotosInReview.tsx
//
// Shows the uploader their own profile photos that are held for manual review
// (docs/MODERATION.md). Nobody else can see these: the rows are owner-only
// (media_moderation RLS) and the images sit in the private media-quarantine
// bucket. Once a moderator approves one, the server appends it to the profile.

import React, { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "@/constants/design-system";
import { supabase } from "@/lib/supabase";
import { MEDIA_QUARANTINE_BUCKET } from "@/lib/moderation/mediaModeration";

const THUMB = 72;

export function PhotosInReview(props: { userId: string | null | undefined; mode: string; refreshKey?: unknown }) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!props.userId) return;
      const { data } = await supabase
        .from("media_moderation")
        .select("storage_path")
        .eq("user_id", props.userId)
        .eq("kind", "profile_photo")
        .eq("target", props.mode)
        .eq("status", "review")
        .order("created_at", { ascending: true })
        .limit(10);
      const paths = (data ?? []).map((r: { storage_path: string }) => r.storage_path);
      if (!paths.length) {
        if (!cancelled) setUrls([]);
        return;
      }
      const { data: signed } = await supabase.storage.from(MEDIA_QUARANTINE_BUCKET).createSignedUrls(paths, 60 * 60);
      if (!cancelled) setUrls((signed ?? []).map((s) => s.signedUrl).filter((u): u is string => !!u));
    })().catch(() => {
      if (!cancelled) setUrls([]);
    });
    return () => {
      cancelled = true;
    };
  }, [props.userId, props.mode, props.refreshKey]);

  if (!urls.length) return null;

  return (
    <View
      style={{
        marginTop: theme.spacing.sm,
        marginBottom: theme.spacing.md,
        padding: theme.spacing.md,
        borderRadius: theme.radii.md,
        backgroundColor: theme.colors.warningBg,
        borderWidth: 1,
        borderColor: theme.colors.warningBorder,
      }}
    >
      <Text style={[theme.type.bodyMedium, { fontFamily: theme.type.bodyMedium.fontFamily, color: theme.colors.textPrimary }]}>
        {t("moderation.inReviewTitle")}
      </Text>
      <Text
        style={[
          theme.type.caption,
          { fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
        ]}
      >
        {t("moderation.inReviewBody")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
        {urls.map((uri) => (
          <Image
            key={uri}
            source={{ uri }}
            accessibilityLabel={t("moderation.inReviewBadge")}
            style={{ width: THUMB, height: THUMB, borderRadius: theme.radii.sm, opacity: 0.8 }}
            resizeMode="cover"
          />
        ))}
      </View>
    </View>
  );
}
