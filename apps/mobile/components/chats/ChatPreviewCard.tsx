/**
 * ChatPreviewCard — Conversation row for chat inboxes.
 * Avatar mode badge (icon), online dot, inline Invite pill, mode-colored unread badge.
 */

import React from "react";
import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography } from "@/constants/tokens";
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

function getLastMessagePreview(msg: Message | null): string {
  if (!msg) return "No messages yet";
  if (msg.delete_type === "for_everyone") return "Message deleted";
  if (msg.message_type === "image" || msg.message_type === "gif") return "📷 Photo";
  if (msg.message_type === "audio") return "🎤 Voice message";
  if (msg.content?.trim()) return msg.content.trim();
  return "Message";
}

function ModeBadgeIcon({ mode }: { mode: ReturnType<typeof getChatModeDisplay> }) {
  if (!mode) return null;
  return (
    <View style={styles.modeBadge} accessibilityLabel={`${mode.label} chat`}>
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
  const hasUnread = unreadCount > 0;
  const isDm = conversation.type === "dm";
  const canOpenProfile = isDm && participantAvatars.length === 1 && onAvatarPress;
  const modeDisplay =
    showModeContext && conversation.mode
      ? getChatModeDisplay(conversation.mode)
      : null;
  const unreadBadgeColor = modeDisplay?.primary ?? Colors.primaryViolet;
  const previewText =
    lastMessagePreview ??
    (isPendingRomanceInvite ? "Sent you a chat invite" : getLastMessagePreview(lastMessage));

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
          <Ionicons name="person" size={24} color={Colors.gray500} />
        </View>
      )}
      {modeDisplay && <ModeBadgeIcon mode={modeDisplay} />}
      {isOnline && <View style={styles.onlineDot} accessibilityLabel="Online" />}
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
                <Ionicons name="person" size={16} color={Colors.gray500} />
              </View>
            )}
            {i === 0 && modeDisplay && <ModeBadgeIcon mode={modeDisplay} />}
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
          <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: modeDisplay?.primary ?? Colors.events.primary }]}>
            <Ionicons name="musical-notes" size={22} color={Colors.white} />
          </View>
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Ionicons name="chatbubbles" size={22} color={Colors.gray500} />
          </View>
        )}
        {modeDisplay && <ModeBadgeIcon mode={modeDisplay} />}
      </View>
    );

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      android_ripple={{ color: Colors.gray200 }}
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
                <Ionicons name="mail" size={11} color={Colors.romance.primary} />
                <Text style={styles.inviteBadgeText}>Invite</Text>
              </View>
            )}
            {isPinned && (
              <Ionicons name="pin" size={12} color={Colors.gray500} style={styles.pinnedIcon} />
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

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray200,
  },
  rowPressed: {
    backgroundColor: Colors.gray100,
  },
  avatarSection: {
    marginRight: 12,
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
    backgroundColor: Colors.gray100,
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
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Colors.gray200,
    zIndex: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
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
    borderColor: Colors.white,
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
    borderColor: Colors.white,
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
    marginBottom: 4,
    gap: 8,
  },
  titleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  chatName: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  chatNameUnread: {
    fontWeight: "700",
  },
  inviteBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.romance.secondary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    flexShrink: 0,
  },
  inviteBadgeText: {
    ...Typography.caption,
    fontSize: 10,
    fontWeight: "700",
    color: Colors.romance.primary,
  },
  pinnedIcon: {
    flexShrink: 0,
  },
  timestamp: {
    ...Typography.caption,
    fontSize: 12,
    color: Colors.gray500,
    flexShrink: 0,
  },
  timestampUnread: {
    color: Colors.textPrimary,
    fontWeight: "600",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  lastMessage: {
    flex: 1,
    fontSize: 14,
    color: Colors.gray600,
  },
  lastMessageUnread: {
    color: Colors.textPrimary,
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
    color: Colors.white,
  },
});
