// apps/mobile/components/chats/ModeratedChatImage.tsx
//
// Chat image bubble that respects the server-side moderation verdict
// (docs/MODERATION.md). Recipients see images still in review (or with an
// unknown verdict) blurred behind "Tap to view"; blocked images are replaced by
// a notice. The sender always sees their own image, with an "In review" hint.

import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/constants/design-system";
import { chatImageDisplay } from "@/lib/moderation/mediaModeration";
import type { MessageAttachment } from "@/lib/chats/types";

const SIZE = 200;
/** Heavy enough that nothing explicit is recognisable before the user opts in. */
const BLUR_RADIUS = 40;

export function ModeratedChatImage(props: {
  uri: string;
  attachment?: MessageAttachment;
  mine: boolean;
  onReport?: () => void;
}) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const moderation = props.attachment?.moderation;
  const display = chatImageDisplay({
    hasPath: !!props.attachment?.path,
    moderation,
    mine: props.mine,
    revealed,
  });

  const box = { width: SIZE, height: SIZE, borderRadius: theme.radii.md };

  if (display === "removed") {
    return (
      <View
        style={[
          box,
          styles.center,
          { backgroundColor: theme.colors.backgroundMuted, borderColor: theme.colors.border, borderWidth: 1 },
        ]}
      >
        <Ionicons name="eye-off-outline" size={24} color={theme.colors.textMuted} />
        <Text style={[theme.type.caption, { fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>
          {t("moderation.photoRemoved")}
        </Text>
      </View>
    );
  }

  if (display === "blurred") {
    return (
      <View style={[box, { overflow: "hidden" }]}>
        <Image source={{ uri: props.uri }} style={box} resizeMode="cover" blurRadius={BLUR_RADIUS} />
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: theme.colors.overlay, padding: theme.spacing.md }]}>
          <Pressable
            onPress={() => setRevealed(true)}
            accessibilityRole="button"
            accessibilityLabel={t("moderation.tapToView")}
            style={[
              styles.center,
              {
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radii.pill,
                paddingVertical: theme.spacing.sm,
                paddingHorizontal: theme.spacing.lg,
              },
            ]}
          >
            <Text style={[theme.type.button, { fontFamily: theme.type.button.fontFamily, color: theme.colors.textPrimary }]}>
              {t("moderation.tapToView")}
            </Text>
          </Pressable>
          <Text
            style={[
              theme.type.caption,
              { fontFamily: theme.type.caption.fontFamily, color: theme.colors.surface, textAlign: "center", marginTop: theme.spacing.sm },
            ]}
          >
            {t("moderation.sensitiveHint")}
          </Text>
          {props.onReport ? (
            <Pressable onPress={props.onReport} hitSlop={8} accessibilityRole="button" style={{ marginTop: theme.spacing.sm }}>
              <Text style={[theme.type.caption, { fontFamily: theme.fontFamily.bodySemiBold, color: theme.colors.surface, textDecorationLine: "underline" }]}>
                {t("moderation.report")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View>
      <Image source={{ uri: props.uri }} style={box} resizeMode="cover" />
      {props.mine && props.attachment?.path && moderation === "review" ? (
        <View
          style={{
            position: "absolute",
            top: theme.spacing.sm,
            left: theme.spacing.sm,
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radii.pill,
            paddingVertical: theme.spacing.xxs,
            paddingHorizontal: theme.spacing.sm,
          }}
        >
          <Text style={[theme.type.overline, { fontFamily: theme.type.overline.fontFamily, color: theme.colors.textSecondary }]}>
            {t("moderation.inReviewBadge")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
});
