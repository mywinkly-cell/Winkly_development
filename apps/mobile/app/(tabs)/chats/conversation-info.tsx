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
import { Colors, Typography, Layout } from "@/constants/tokens";
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
        <ActivityIndicator size="large" color={Colors.primaryViolet} />
      </SafeScreenView>
    );
  }

  return (
    <SafeScreenView style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={styles.iconBtn}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.topTitle}>Group info</Text>
        {canEditGroup ? (
          <Pressable onPress={handleEditGroup} style={styles.editBtn} accessibilityLabel="Edit group">
            <Text style={styles.editText}>Edit</Text>
          </Pressable>
        ) : (
          <View style={styles.iconBtnPlaceholder} />
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primaryViolet} />
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
          <View style={styles.heroCard}>
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
          </View>

          {ownerOrAdmin ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionLabel}>Owner / Administrator</Text>
              <Pressable
                style={styles.memberRow}
                onPress={() => handleOpenMemberProfile(ownerOrAdmin)}
                disabled={ownerOrAdmin.userId === details.meId}
              >
                <Avatar
                  uri={ownerOrAdmin.photoUrl}
                  initials={memberInitials(ownerOrAdmin)}
                  size={44}
                />
                <View style={styles.memberTextWrap}>
                  <Text style={styles.memberName}>
                    {formatConversationMemberName(ownerOrAdmin, details.meId)}
                  </Text>
                  <Text style={styles.memberRole}>{roleLabel(ownerOrAdmin.role)}</Text>
                </View>
                {ownerOrAdmin.userId !== details.meId ? (
                  <Ionicons name="chevron-forward" size={18} color={Colors.gray500} />
                ) : null}
              </Pressable>
            </View>
          ) : null}

          <View style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>Participants</Text>
            {details.members.map((member) => (
              <Pressable
                key={member.userId}
                style={styles.memberRow}
                onPress={() => handleOpenMemberProfile(member)}
                disabled={member.userId === details.meId}
              >
                <Avatar uri={member.photoUrl} initials={memberInitials(member)} size={44} />
                <View style={styles.memberTextWrap}>
                  <Text style={styles.memberName}>
                    {formatConversationMemberName(member, details.meId)}
                  </Text>
                  <Text style={styles.memberRole}>{roleLabel(member.role)}</Text>
                </View>
                {member.userId !== details.meId ? (
                  <Ionicons name="chevron-forward" size={18} color={Colors.gray500} />
                ) : null}
              </Pressable>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>Chat settings</Text>

            <View style={styles.settingRow}>
              <View style={styles.settingTextWrap}>
                <Text style={styles.settingTitle}>Mute notifications</Text>
                <Text style={styles.settingSub}>Stop push alerts for this chat</Text>
              </View>
              <Switch
                value={details.muted}
                onValueChange={handleToggleMute}
                trackColor={{ false: Colors.gray300, true: Colors.primaryViolet + "88" }}
                thumbColor={details.muted ? Colors.primaryViolet : Colors.gray100}
              />
            </View>

            <View style={styles.settingDivider} />

            <View style={styles.settingRow}>
              <View style={styles.settingTextWrap}>
                <Text style={styles.settingTitle}>Read receipts</Text>
                <Text style={styles.settingSub}>Let others see when you have read messages</Text>
              </View>
              <Switch
                value={details.readReceiptsOn}
                onValueChange={handleToggleReadReceipts}
                trackColor={{ false: Colors.gray300, true: Colors.primaryViolet + "88" }}
                thumbColor={details.readReceiptsOn ? Colors.primaryViolet : Colors.gray100}
              />
            </View>
          </View>

          <Pressable
            onPress={handleLeave}
            disabled={leaving}
            style={[styles.leaveBtn, leaving ? styles.leaveBtnDisabled : null]}
          >
            {leaving ? (
              <ActivityIndicator color={Colors.errorRed} />
            ) : (
              <>
                <Ionicons name="exit-outline" size={20} color={Colors.errorRed} />
                <Text style={styles.leaveText}>Leave group</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      ) : null}
    </SafeScreenView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  topTitle: { ...Typography.headerTitle, color: Colors.textPrimary },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnPlaceholder: { width: 44, height: 44 },
  editBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.primaryViolet,
  },
  editText: { ...Typography.caption, color: Colors.accentYellow, fontWeight: "700" },
  scroll: { padding: 16, paddingBottom: 40, gap: 14 },
  heroCard: {
    backgroundColor: "#FFF",
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 20,
    alignItems: "center",
  },
  heroTitle: { ...Typography.h2, color: Colors.textPrimary, marginTop: 14, textAlign: "center" },
  heroDescription: {
    ...Typography.body,
    color: Colors.gray700,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 22,
  },
  heroDescriptionMuted: {
    ...Typography.body,
    color: Colors.gray500,
    marginTop: 8,
    textAlign: "center",
    fontStyle: "italic",
  },
  heroMeta: { ...Typography.caption, color: Colors.gray600, marginTop: 10 },
  sectionCard: {
    backgroundColor: "#FFF",
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 14,
  },
  sectionLabel: {
    ...Typography.caption,
    color: Colors.gray600,
    fontWeight: "700",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
  memberTextWrap: { flex: 1, minWidth: 0 },
  memberName: { ...Typography.body, color: Colors.textPrimary, fontWeight: "700" },
  memberRole: { ...Typography.caption, color: Colors.gray600, marginTop: 2 },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  settingTextWrap: { flex: 1 },
  settingTitle: { ...Typography.body, color: Colors.textPrimary, fontWeight: "700" },
  settingSub: { ...Typography.caption, color: Colors.gray600, marginTop: 2 },
  settingDivider: { height: 1, backgroundColor: Colors.gray200, marginVertical: 6 },
  leaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: Layout.radii.control,
    borderWidth: 1,
    borderColor: Colors.errorRed + "55",
    backgroundColor: Colors.errorRed + "10",
  },
  leaveBtnDisabled: { opacity: 0.7 },
  leaveText: { ...Typography.button, color: Colors.errorRed },
  errorText: { ...Typography.body, color: Colors.errorRed, textAlign: "center", marginBottom: 12 },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.gray100,
  },
  retryText: { ...Typography.button, color: Colors.textPrimary },
});
