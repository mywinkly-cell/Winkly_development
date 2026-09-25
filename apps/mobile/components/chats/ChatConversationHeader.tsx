/**
 * Tappable chat title: avatar/icon + name for 1:1 and group threads.
 */

import React from "react";
import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/ui/Avatar";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

type ParticipantAvatar = {
  uri?: string | null;
  initials: string;
};

type ChatConversationHeaderProps = {
  isGroup: boolean;
  displayName: string;
  subtitle: string;
  peerAvatarUri?: string | null;
  peerInitials?: string;
  groupAvatarUri?: string | null;
  participantAvatars?: ParticipantAvatar[];
  onPress: () => void;
  accessibilityLabel?: string;
};

function GroupAvatarStack({
  groupAvatarUri,
  participantAvatars,
  displayName,
  styles,
  theme,
}: {
  groupAvatarUri?: string | null;
  participantAvatars: ParticipantAvatar[];
  displayName: string;
  styles: ReturnType<typeof createStyles>;
  theme: AppTheme;
}) {
  if (groupAvatarUri) {
    return <Avatar uri={groupAvatarUri} initials={displayName.slice(0, 2)} size={40} />;
  }

  if (participantAvatars.length >= 2) {
    return (
      <View style={styles.avatarStack}>
        {participantAvatars.slice(0, 2).map((entry, index) => (
          <View
            key={`${entry.initials}-${index}`}
            style={[styles.stackedAvatarWrap, index > 0 ? styles.stackedAvatarOverlap : null]}
          >
            {entry.uri ? (
              <Image source={{ uri: entry.uri }} style={styles.stackedAvatar} resizeMode="cover" />
            ) : (
              <View style={[styles.stackedAvatar, styles.stackedPlaceholder]}>
                <Text style={styles.stackedInitials}>{entry.initials.slice(0, 2)}</Text>
              </View>
            )}
          </View>
        ))}
      </View>
    );
  }

  if (participantAvatars.length === 1) {
    const entry = participantAvatars[0];
    return <Avatar uri={entry.uri} initials={entry.initials} size={40} />;
  }

  return (
    <View style={styles.groupIconWrap}>
      <Ionicons name="people" size={22} color={theme.colors.primary} />
    </View>
  );
}

export function ChatConversationHeader({
  isGroup,
  displayName,
  subtitle,
  peerAvatarUri,
  peerInitials = "?",
  groupAvatarUri,
  participantAvatars = [],
  onPress,
  accessibilityLabel,
}: ChatConversationHeaderProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  return (
    <Pressable
      style={styles.container}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? t("chat.header.detailsA11y", { name: displayName })}
    >
      {isGroup ? (
        <GroupAvatarStack
          groupAvatarUri={groupAvatarUri}
          participantAvatars={participantAvatars}
          displayName={displayName}
          styles={styles}
          theme={theme}
        />
      ) : (
        <Avatar uri={peerAvatarUri} initials={peerInitials} size={40} />
      )}

      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.xxs,
    },
    textWrap: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      ...theme.type.bodyMedium,
      fontFamily: theme.type.bodyMedium.fontFamily,
      fontWeight: "700",
      color: theme.colors.textPrimary,
    },
    subtitle: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    groupIconWrap: {
      width: 40,
      height: 40,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.primary + "18",
      alignItems: "center",
      justifyContent: "center",
    },
    avatarStack: {
      width: 44,
      height: 40,
      position: "relative",
    },
    stackedAvatarWrap: {
      position: "absolute",
      top: 0,
      left: 0,
      width: 28,
      height: 28,
      borderRadius: 14,
      overflow: "hidden",
      borderWidth: 2,
      borderColor: theme.colors.background,
    },
    stackedAvatarOverlap: {
      left: 16,
      top: 12,
    },
    stackedAvatar: {
      width: "100%",
      height: "100%",
    },
    stackedPlaceholder: {
      backgroundColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    stackedInitials: {
      fontSize: 10,
      fontWeight: "700",
      color: theme.colors.textSecondary,
    },
  });
}
