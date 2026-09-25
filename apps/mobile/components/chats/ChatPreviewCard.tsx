/**
 * ChatPreviewCard — Conversation row for chat inboxes.
 * Avatar mode badge (icon), online dot, inline Invite pill, mode-colored unread badge.
 */

import React from "react";
import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { getChatModeDisplay } from "@/lib/chats/modeDisplay";
import type { Conversation, Message } from "@/lib/chats/types";

const EVENTS_ICON = require("@/assets/icons/events-icon_1.png");
const ONLINE_GREEN = "#34C759";

type AvatarEntry = {
  userId: string;
  photoUrl?: string | null;
  placeholderEmoji?: string;
  placeholderBg?: string;
};

type ChatPreviewCardProps = {
  conversation: Conversation;
  chatName: string;
  lastMessage: Message | null;
  participantAvatars: AvatarEntry[];
  timestamp: string;
  unreadCount: number;
  isPinned: boolean;
  onPress: () => void;
  onAvatarPress?: (userId: string) => void;
  isPendingRomanceInvite?: boolean;
  showModeContext?: boolean;
  isOnline?: boolean;
  /** Override preview text (e.g. demo rows). */
  lastMessagePreview?: string;
};

function getLastMessagePreview(msg: Message | null, labels: {
  noMessages: string;
  deleted: string;
  photo: string;
  voice: string;
  message: string;
}): string {
  if (!msg) return labels.noMessages;
  if (msg.delete_type === "for_everyone") return labels.deleted;
  if (msg.message_type === "image" || msg.message_type === "gif") return `📷 ${labels.photo}`;
  if (msg.message_type === "audio") return `🎤 ${labels.voice}`;
  if (msg.content?.trim()) return msg.content.trim();
  return labels.message;
}

function ModeBadgeIcon({ mode, styles }: { mode: ReturnType<typeof getChatModeDisplay>; styles: ReturnType<typeof createStyles> }) {
  const { t } = useTranslation();
  if (!mode) return null;
  return (
    <View style={styles.modeBadge} accessibilityLabel={t("chat.preview.modeChatA11y", { mode: mode.label })}>
      {mode.useEventsImage ? (
        <Image
          source={EVENTS_ICON}
          style={[styles.modeBadgeEventsIcon, { tintColor: mode.primary }]}
          resizeMode="contain"
        />
      ) : (
        <Ionicons name={mode.icon} size={11} color={mode.primary} />
      )}
    </View>
  );
}

export function ChatPreviewCard({
  conversation,
  chatName,
  lastMessage,
  participantAvatars,
  timestamp,
  unreadCount,
  isPinned,
  onPress,
  onAvatarPress,
  isPendingRomanceInvite = false,
  showModeContext = true,
  isOnline = false,
  lastMessagePreview,
}: ChatPreviewCardProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const previewLabels = {
    noMessages: t("chat.noMessagesYet"),
    deleted: t("chat.messageDeleted"),
    photo: t("chat.photo"),
    voice: t("chat.voiceMessage"),
    message: t("chat.message"),
  };
  const hasUnread = unreadCount > 0;
  const isDm = conversation.type === "dm";
  const canOpenProfile = isDm && participantAvatars.length === 1 && onAvatarPress;
  const modeDisplay =
    showModeContext && conversation.mode
      ? getChatModeDisplay(conversation.mode)
      : null;
  const unreadBadgeColor = modeDisplay?.primary ?? theme.colors.primary;
  const previewText =
    lastMessagePreview ??
    (isPendingRomanceInvite ? t("chat.preview.sentInvite") : getLastMessagePreview(lastMessage, previewLabels));

  const renderSingleAvatar = (entry: AvatarEntry) => (
    <View
      style={[
        styles.avatarWrap,
        entry.placeholderBg ? { backgroundColor: entry.placeholderBg } : null,
      ]}
    >
      {entry.photoUrl ? (
        <Image source={{ uri: entry.photoUrl }} style={styles.avatar} resizeMode="cover" />
      ) : entry.placeholderEmoji ? (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarEmoji}>{entry.placeholderEmoji}</Text>
        </View>
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Ionicons name="person" size={24} color={theme.colors.textMuted} />
        </View>
      )}
      {modeDisplay && <ModeBadgeIcon mode={modeDisplay} styles={styles} />}
      {isOnline && <View style={styles.onlineDot} accessibilityLabel={t("chat.preview.online")} />}
    </View>
  );

  const avatarContent =
    participantAvatars.length === 1 ? (
      renderSingleAvatar(participantAvatars[0])
    ) : participantAvatars.length > 1 ? (
      <View style={styles.avatarStack}>
        {participantAvatars.slice(0, 2).map((a, i) => (
          <View
            key={a.userId}
            style={[
              styles.avatarWrap,
              styles.avatarStacked,
              a.placeholderBg ? { backgroundColor: a.placeholderBg } : null,
              { marginLeft: i === 1 ? -14 : 0, zIndex: 2 - i },
            ]}
          >
            {a.photoUrl ? (
              <Image source={{ uri: a.photoUrl }} style={styles.avatarStackedImg} resizeMode="cover" />
            ) : a.placeholderEmoji ? (
              <View style={[styles.avatarStackedImg, styles.avatarPlaceholder]}>
                <Text style={styles.avatarEmojiSmall}>{a.placeholderEmoji}</Text>
              </View>
            ) : (
              <View style={[styles.avatarStackedImg, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={16} color={theme.colors.textMuted} />
              </View>
            )}
            {i === 0 && modeDisplay && <ModeBadgeIcon mode={modeDisplay} styles={styles} />}
            {i === 0 && isOnline && <View style={styles.onlineDotSmall} />}
          </View>
        ))}
      </View>
    ) : (
      <View
        style={[
          styles.avatarWrap,
          modeDisplay ? { backgroundColor: modeDisplay.secondary } : styles.avatarPlaceholder,
        ]}
      >
        {conversation.type === "event" ? (
          <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: modeDisplay?.primary ?? theme.modeAccent("events").primary }]}>
            <Ionicons name="musical-notes" size={22} color={theme.colors.onPrimary} />
          </View>
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Ionicons name="chatbubbles" size={22} color={theme.colors.textMuted} />
          </View>
        )}
        {modeDisplay && <ModeBadgeIcon mode={modeDisplay} styles={styles} />}
      </View>
    );

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      android_ripple={{ color: theme.colors.backgroundMuted }}
    >
      <View style={styles.avatarSection}>
        {canOpenProfile ? (
          <Pressable
            onPress={(e) => {
              e?.stopPropagation?.();
              onAvatarPress(participantAvatars[0].userId);
            }}
            style={styles.avatarTapTarget}
          >
            {avatarContent}
          </Pressable>
        ) : (
          avatarContent
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={styles.titleRow}>
            <Text style={[styles.chatName, hasUnread && styles.chatNameUnread]} numberOfLines={1}>
              {chatName}
            </Text>
            {isPendingRomanceInvite && (
              <View style={styles.inviteBadge}>
                <Ionicons name="mail" size={11} color={theme.modeAccent("romance").primary} />
                <Text style={styles.inviteBadgeText} numberOfLines={1}>{t("chat.preview.inviteBadge")}</Text>
              </View>
            )}
            {isPinned && (
              <Ionicons name="pin" size={12} color={theme.colors.textMuted} style={styles.pinnedIcon} />
            )}
          </View>
          <Text style={[styles.timestamp, hasUnread && styles.timestampUnread]} numberOfLines={1}>
            {timestamp}
          </Text>
        </View>

        <View style={styles.bottomRow}>
          <Text
            style={[styles.lastMessage, hasUnread && styles.lastMessageUnread]}
            numberOfLines={1}
          >
            {previewText}
          </Text>
          {hasUnread && (
            <View style={[styles.unreadBadge, { backgroundColor: unreadBadgeColor }]}>
              <Text style={styles.unreadCount}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    rowPressed: {
      backgroundColor: theme.colors.backgroundMuted,
    },
    avatarSection: {
      marginRight: theme.spacing.md,
      flexShrink: 0,
    },
    avatarTapTarget: {
      alignSelf: "flex-start",
    },
    avatarWrap: {
      width: 52,
      height: 52,
      borderRadius: 26,
      overflow: "visible",
      backgroundColor: theme.colors.backgroundMuted,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      overflow: "hidden",
    },
    avatarPlaceholder: {
      alignItems: "center",
      justifyContent: "center",
    },
    avatarEmoji: {
      fontSize: 26,
    },
    avatarEmojiSmall: {
      fontSize: 18,
    },
    avatarStack: {
      flexDirection: "row",
      width: 52,
      height: 52,
    },
    avatarStacked: {
      width: 36,
      height: 36,
      borderRadius: 18,
      overflow: "visible",
    },
    avatarStackedImg: {
      width: 36,
      height: 36,
      borderRadius: 18,
      overflow: "hidden",
    },
    modeBadge: {
      position: "absolute",
      top: -2,
      right: -2,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: theme.colors.border,
      zIndex: 3,
      ...theme.elevation(1),
    },
    modeBadgeEventsIcon: {
      width: 11,
      height: 11,
    },
    onlineDot: {
      position: "absolute",
      bottom: 0,
      right: 0,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: ONLINE_GREEN,
      borderWidth: 2,
      borderColor: theme.colors.surface,
      zIndex: 3,
    },
    onlineDotSmall: {
      position: "absolute",
      bottom: -1,
      right: -1,
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: ONLINE_GREEN,
      borderWidth: 2,
      borderColor: theme.colors.surface,
      zIndex: 3,
    },
    content: {
      flex: 1,
      minWidth: 0,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing.xxs,
      gap: theme.spacing.sm,
    },
    titleRow: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
      minWidth: 0,
    },
    chatName: {
      ...theme.type.bodyMedium,
      fontFamily: theme.type.bodyMedium.fontFamily,
      color: theme.colors.textPrimary,
      flexShrink: 1,
    },
    chatNameUnread: {
      fontWeight: "700",
    },
    inviteBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: theme.modeAccent("romance").bg,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 2,
      borderRadius: theme.radii.sm,
      flexShrink: 0,
    },
    inviteBadgeText: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      fontSize: 10,
      fontWeight: "700",
      color: theme.modeAccent("romance").primary,
    },
    pinnedIcon: {
      flexShrink: 0,
    },
    timestamp: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      fontSize: 12,
      color: theme.colors.textMuted,
      flexShrink: 0,
    },
    timestampUnread: {
      color: theme.colors.textPrimary,
      fontWeight: "600",
    },
    bottomRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    lastMessage: {
      flex: 1,
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    lastMessageUnread: {
      color: theme.colors.textPrimary,
      fontWeight: "500",
    },
    unreadBadge: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 5,
      flexShrink: 0,
    },
    unreadCount: {
      fontSize: 11,
      fontWeight: "700",
      color: theme.colors.onPrimary,
    },
  });
}
