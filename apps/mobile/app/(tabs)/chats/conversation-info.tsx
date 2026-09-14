import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Avatar } from "@/components/ui/Avatar";
import { Card, Header, ListRow } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import {
  leaveConversation,
  setConversationMuted,
  setReadReceiptsPreference,
} from "@/lib/chats/api";
import {
  formatConversationMemberName,
  loadConversationDetails,
  type ConversationDetails,
  type ConversationMemberInfo,
} from "@/lib/chats/conversationInfo";
import { openPeerProfile } from "@/lib/chats/peerProfileNavigation";
import { chatRoutes, useModeHub } from "@/lib/navigation/modeHub";

export const unstable_settings = { href: null };

function roleLabel(role: string) {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Administrator";
  if (role === "moderator") return "Moderator";
  return "Member";
}

function memberInitials(member: ConversationMemberInfo) {
  const first = (member.firstName ?? "").trim();
  const last = (member.lastName ?? "").trim();
  if (first && last) return `${first[0]}${last[0]}`;
  if (first) return first.slice(0, 2);
  return "??";
}

export default function ConversationInfoScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const chatHub = useModeHub();
  const { conversationId } = useLocalSearchParams<{ conversationId?: string }>();
  const convId = String(conversationId ?? "");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<ConversationDetails | null>(null);
  const [leaving, setLeaving] = useState(false);

  const reload = useCallback(async () => {
    if (!convId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await loadConversationDetails(convId);
      setDetails(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load conversation");
    } finally {
      setLoading(false);
    }
  }, [convId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const displayName = useMemo(() => {
    if (!details) return "Chat";
    return details.groupName?.trim() || details.conversationName?.trim() || "Group chat";
  }, [details]);

  const ownerOrAdmin = useMemo(() => {
    if (!details) return null;
    const ownerId = details.groupCreatedBy;
    const admin = details.members.find(
      (m) => m.role === "owner" || m.role === "admin" || m.userId === ownerId
    );
    return admin ?? null;
  }, [details]);

  const handleOpenMemberProfile = useCallback(
    (member: ConversationMemberInfo) => {
      if (member.userId === details?.meId) return;
      const mode = details?.mode;
      if (mode !== "romance" && mode !== "friends" && mode !== "business") return;
      Haptics.selectionAsync();
      openPeerProfile(router, member.userId, mode);
    },
    [details?.meId, details?.mode, router]
  );

  const handleToggleMute = useCallback(async () => {
    if (!details) return;
    try {
      const next = !details.muted;
      await setConversationMuted(details.conversationId, next);
      setDetails({ ...details, muted: next });
      Haptics.selectionAsync();
    } catch {
      Alert.alert("Could not update", "Mute setting could not be saved.");
    }
  }, [details]);

  const handleToggleReadReceipts = useCallback(async () => {
    if (!details) return;
    try {
      const next = !details.readReceiptsOn;
      await setReadReceiptsPreference(next);
      setDetails({ ...details, readReceiptsOn: next });
      Haptics.selectionAsync();
    } catch {
      Alert.alert("Could not update", "Read receipts setting could not be saved.");
    }
  }, [details]);

  const handleLeave = useCallback(() => {
    if (!details) return;
    Alert.alert(
      "Leave group",
      `Leave "${displayName}"? You will stop receiving messages from this group.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            setLeaving(true);
            try {
              await leaveConversation(details.conversationId);
              router.replace(chatRoutes.index(chatHub) as Parameters<typeof router.replace>[0]);
            } catch {
              Alert.alert("Could not leave", "Please try again.");
            } finally {
              setLeaving(false);
            }
          },
        },
      ]
    );
  }, [details, displayName, router, chatHub]);

  const handleEditGroup = useCallback(() => {
    if (!details?.groupId) return;
    Haptics.selectionAsync();
    router.push({
      pathname: "/groups/edit-group",
      params: { id: details.groupId, name: displayName },
    });
  }, [details?.groupId, displayName, router]);

  const canEditGroup = useMemo(() => {
    if (!details?.groupId || !details.meId) return false;
    const me = details.members.find((m) => m.userId === details.meId);
    return me?.role === "owner" || me?.role === "admin" || details.groupCreatedBy === details.meId;
  }, [details]);

  if (!convId) {
    return (
      <SafeScreenView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeScreenView>
    );
  }

  return (
    <SafeScreenView style={styles.screen}>
      <Header
        title="Group info"
        onBack={() => router.back()}
        trailing={
          canEditGroup ? (
            <Pressable onPress={handleEditGroup} style={styles.editBtn} accessibilityLabel="Edit group">
              <Text style={styles.editText}>Edit</Text>
            </Pressable>
          ) : undefined
        }
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={reload} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : details ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Card style={styles.heroCard}>
            <Avatar
              uri={details.groupAvatarUrl}
              initials={displayName.slice(0, 2)}
              size={88}
            />
            <Text style={styles.heroTitle}>{displayName}</Text>
            {details.groupDescription?.trim() ? (
              <Text style={styles.heroDescription}>{details.groupDescription.trim()}</Text>
            ) : (
              <Text style={styles.heroDescriptionMuted}>No description yet.</Text>
            )}
            <Text style={styles.heroMeta}>
              {details.mode} • {details.members.length}{" "}
              {details.members.length === 1 ? "member" : "members"}
            </Text>
          </Card>

          {ownerOrAdmin ? (
            <Card padding="md" style={styles.sectionCard}>
              <Text style={styles.sectionLabel}>Owner / Administrator</Text>
              <ListRow
                title={formatConversationMemberName(ownerOrAdmin, details.meId)}
                subtitle={roleLabel(ownerOrAdmin.role)}
                onPress={
                  ownerOrAdmin.userId === details.meId
                    ? undefined
                    : () => handleOpenMemberProfile(ownerOrAdmin)
                }
                style={styles.memberRow}
                leading={<Avatar uri={ownerOrAdmin.photoUrl} initials={memberInitials(ownerOrAdmin)} size={44} />}
              />
            </Card>
          ) : null}

          <Card padding="md" style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>Participants</Text>
            {details.members.map((member) => (
              <ListRow
                key={member.userId}
                title={formatConversationMemberName(member, details.meId)}
                subtitle={roleLabel(member.role)}
                onPress={member.userId === details.meId ? undefined : () => handleOpenMemberProfile(member)}
                style={styles.memberRow}
                leading={<Avatar uri={member.photoUrl} initials={memberInitials(member)} size={44} />}
              />
            ))}
          </Card>

          <Card padding="md" style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>Chat settings</Text>

            <ListRow
              title="Mute notifications"
              subtitle="Stop push alerts for this chat"
              style={styles.settingRow}
              trailing={
                <Switch
                  value={details.muted}
                  onValueChange={handleToggleMute}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary + "88" }}
                  thumbColor={details.muted ? theme.colors.primary : theme.colors.backgroundMuted}
                />
              }
            />
            <ListRow
              title="Read receipts"
              subtitle="Let others see when you have read messages"
              style={{ ...styles.settingRow, ...styles.settingRowBorder }}
              trailing={
                <Switch
                  value={details.readReceiptsOn}
                  onValueChange={handleToggleReadReceipts}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary + "88" }}
                  thumbColor={details.readReceiptsOn ? theme.colors.primary : theme.colors.backgroundMuted}
                />
              }
            />
          </Card>

          <Pressable
            onPress={handleLeave}
            disabled={leaving}
            style={{ ...styles.leaveBtn, ...(leaving ? styles.leaveBtnDisabled : null) }}
          >
            {leaving ? (
              <ActivityIndicator color={theme.colors.error} />
            ) : (
              <>
                <Ionicons name="exit-outline" size={20} color={theme.colors.error} />
                <Text style={styles.leaveText}>Leave group</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      ) : null}
    </SafeScreenView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing.xl },
    editBtn: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radii.sm,
      backgroundColor: theme.colors.primary,
    },
    editText: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.onPrimary, fontWeight: "700" },
    scroll: { padding: theme.spacing.lg, paddingBottom: theme.spacing.huge, gap: theme.spacing.md },
    heroCard: { alignItems: "center" },
    heroTitle: { ...theme.type.h2, fontFamily: theme.type.h2.fontFamily, color: theme.colors.textPrimary, marginTop: theme.spacing.md, textAlign: "center" },
    heroDescription: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.sm,
      textAlign: "center",
    },
    heroDescriptionMuted: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textMuted,
      marginTop: theme.spacing.sm,
      textAlign: "center",
      fontStyle: "italic",
    },
    heroMeta: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary, marginTop: theme.spacing.sm },
    sectionCard: {},
    sectionLabel: {
      ...theme.type.overline,
      fontFamily: theme.type.overline.fontFamily,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.sm,
    },
    memberRow: { borderTopWidth: 1, borderTopColor: theme.colors.border },
    settingRow: {},
    settingRowBorder: { borderTopWidth: 1, borderTopColor: theme.colors.border },
    leaveBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.errorBorder,
      backgroundColor: theme.colors.errorBg,
    },
    leaveBtnDisabled: { opacity: 0.7 },
    leaveText: { ...theme.type.button, fontFamily: theme.type.button.fontFamily, color: theme.colors.error },
    errorText: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.error, textAlign: "center", marginBottom: theme.spacing.md },
    retryBtn: {
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radii.sm,
      backgroundColor: theme.colors.backgroundMuted,
    },
    retryText: { ...theme.type.button, fontFamily: theme.type.button.fontFamily, color: theme.colors.textPrimary },
  });
}
