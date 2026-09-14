import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { chatRoutes } from "@/lib/navigation/modeHub";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { getProfileForMode } from "@/lib/access/profiles";
import { friendsFollowProfile } from "@/lib/access/connections";
import { getProfileConnectionStatus } from "@/lib/access/profileConnectionStatus";
import { confirmRemoveConnection, removeModeConnection } from "@/lib/access/removeConnection";
import { createDirectChat } from "@/lib/chats";
import { recordSwipe, sendFriendsRequest } from "@/lib/matching/actions";
import { InviteToPlanModal, type InviteFormValues } from "@/components/chats/InviteToPlanModal";
import {
  promptConnectBeforeInvite,
  submitProfilePlannerInvite,
} from "@/lib/profile/profilePlanInvite";
import {
  getOtherUserCoreFields,
  modeDisplayName,
  type OtherUserCoreFields,
} from "@/lib/profile/otherUserCore";
import {
  normalizeModeProfileRow,
  emptyPublicCoreProfile,
} from "@/lib/profile/publicModeProfile";
import { ModeProfilePublicView } from "@/components/profile/ModeProfilePublicView";
import { ProfileViewHeader } from "@/components/profile/ProfileViewHeader";
import { ProfileSwipeActions } from "@/components/profile/ProfileSwipeActions";
import { ProfileConnectionActions } from "@/components/profile/ProfileConnectionActions";
import { ListRow, TextButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

type FriendProfile = {
  id: string; // profile id
  user_id?: string | null;

  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;

  city?: string | null;
  about?: string | null;
  night_owl?: boolean | null;

  vibe_tags?: string[] | null;
  interests?: string[] | null;

  main_photo_url?: string | null;
  avatar_url?: string | null;
  /** Full Friends sub-profile photos (from friend_profiles view) */
  photos?: (string | null)[] | null;
  /** Friends sub-profile meta: lifestyle, meetup_goals, alcohol, etc. */
  meta?: Record<string, unknown> | null;

  instagram?: string | null;
  created_at?: string | null;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export default function FriendsProfileView() {
  const { i18n } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const params = useLocalSearchParams<{ user_id?: string }>();

  const userId = useMemo(() => (typeof params.user_id === "string" ? params.user_id : ""), [params.user_id]);

  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [coreFields, setCoreFields] = useState<OtherUserCoreFields | null>(null);

  async function loadProfile() {
    try {
      setLoading(true);

      if (!userId || !isUuid(userId)) {
        setProfile(null);
        return;
      }

      const { data: auth } = await supabase.auth.getUser();
      const viewerId = auth?.user?.id;
      if (!viewerId) {
        setProfile(null);
        return;
      }
      setMeId(viewerId);

      const [row, core] = await Promise.all([
        getProfileForMode("friends", viewerId, userId),
        getOtherUserCoreFields(userId),
      ]);
      setCoreFields(core);
      setProfile(row ? (row as FriendProfile) : null);
      if (row) {
        const connection = await getProfileConnectionStatus("friends", viewerId, userId);
        setIsConnected(connection.isConnected);
        setChatId(connection.chatId);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const targetUserId = profile?.user_id ?? profile?.id ?? userId;

  // Privacy: full name only if the user opted in (first name otherwise).
  const displayName = useMemo(
    () =>
      profile
        ? modeDisplayName(
            {
              first_name: profile.first_name,
              last_name: profile.last_name,
              show_full_name: coreFields?.show_full_name,
              display_name: profile.display_name,
            },
            "friends",
            "Friend"
          )
        : "Friend",
    [profile, coreFields?.show_full_name]
  );

  const modeRow = useMemo(
    () => normalizeModeProfileRow("friends", profile as Record<string, unknown> | null),
    [profile]
  );

  const coreForView = useMemo(
    () => coreFields ?? emptyPublicCoreProfile(),
    [coreFields]
  );

  const handlePass = useCallback(async () => {
    if (!targetUserId || actionBusy) return;
    setActionBusy(true);
    try {
      await recordSwipe({ mode: "friends", targetUserId, action: "pass" });
      Haptics.selectionAsync();
      router.back();
    } catch {
      Alert.alert("Error", "Could not save your choice. Please try again.");
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, router, targetUserId]);

  const handleAddFriend = useCallback(async () => {
    if (!targetUserId || actionBusy) return;
    setActionBusy(true);
    try {
      const res = await friendsFollowProfile(targetUserId);
      if (res.is_connection && res.chat_id) {
        setIsConnected(true);
        setChatId(res.chat_id);
        router.push(chatRoutes.conversation("friends", res.chat_id) as Parameters<typeof router.push>[0]);
      } else {
        router.back();
      }
    } catch {
      Alert.alert("Error", "Could not connect. Please try again.");
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, router, targetUserId]);

  const handleSuperConnect = useCallback(async () => {
    if (!targetUserId || actionBusy) return;
    setActionBusy(true);
    try {
      await sendFriendsRequest({ targetUserId, kind: "super_connect" });
      router.back();
    } catch {
      Alert.alert("Error", "Could not send Super Connect. Please try again.");
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, router, targetUserId]);

  const handleChat = useCallback(async () => {
    if (!targetUserId || actionBusy) return;
    setActionBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const meId = auth?.user?.id;
      if (!meId) throw new Error("Not signed in");
      const id = chatId ?? (await createDirectChat(targetUserId, "friends", "connection", meId));
      setChatId(id);
      router.push(chatRoutes.conversation("friends", id) as Parameters<typeof router.push>[0]);
    } catch {
      Alert.alert("Error", "Could not open chat.");
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, chatId, router, targetUserId]);

  const handleRemoveConnection = useCallback(() => {
    if (!profile || !targetUserId) return;
    confirmRemoveConnection({
      mode: "friends",
      firstName: displayName,
      onConfirm: async () => {
        setActionBusy(true);
        try {
          await removeModeConnection(targetUserId, "friends");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
        } catch {
          Alert.alert("Error", "Could not remove contact. Please try again.");
        } finally {
          setActionBusy(false);
        }
      },
    });
  }, [profile, router, targetUserId, displayName]);

  const handlePlannerPress = useCallback(() => {
    if (!targetUserId) return;
    if (!isConnected) {
      promptConnectBeforeInvite("friends");
      return;
    }
    setInviteVisible(true);
  }, [isConnected, targetUserId]);

  const handleInviteSubmit = useCallback(
    async (values: InviteFormValues) => {
      if (!meId || !targetUserId) throw new Error("Missing user");
      await submitProfilePlannerInvite({
        meId,
        targetUserId,
        mode: "friends",
        chatId,
        isConnected,
        values,
      });
      setInviteVisible(false);
      Alert.alert("Invite sent", "Your meet-up invite was sent in chat.");
    },
    [chatId, isConnected, meId, targetUserId]
  );

  return (
    <View style={styles.screen}>
      <ProfileViewHeader
        onBack={() => router.back()}
        mode="friends"
        onPlannerPress={handlePlannerPress}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: theme.spacing.xxl }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.modeAccent("friends").primary} />
            <Text style={styles.loadingText}>Loading profile…</Text>
          </View>
        ) : !profile ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Profile not found</Text>
            <Text style={styles.emptyBody}>
              This usually means the Friends profile table isn't connected yet or the user_id is missing.
            </Text>

            <TextButton
              title="Back to Discover"
              onPress={() => router.push("/(modes)/friends/discover")}
              style={styles.cta}
            />
          </View>
        ) : (
          <>
            <ModeProfilePublicView
              mode="friends"
              core={coreForView}
              modeRow={modeRow}
              locale={i18n?.language ?? "en"}
            />

            {isConnected ? (
              <View style={{ paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.sm }}>
                <ProfileConnectionActions
                  mode="friends"
                  primaryColor={theme.modeAccent("friends").primary}
                  busy={actionBusy}
                  hasChat={!!chatId}
                  onChat={() => void handleChat()}
                  onRemove={handleRemoveConnection}
                />
                <ListRow
                  title="Add to a group"
                  onPress={() =>
                    router.push({
                      pathname: "/groups/create-group",
                      params: { mode: "friends", preselect: targetUserId },
                    })
                  }
                  style={styles.linkRow}
                />
              </View>
            ) : (
              <ProfileSwipeActions
                mode="friends"
                primaryColor={theme.modeAccent("friends").primary}
                disabled={actionBusy}
                onPass={() => void handlePass()}
                onSuper={() => void handleSuperConnect()}
                onLike={() => void handleAddFriend()}
              />
            )}
          </>
        )}
      </ScrollView>

      {profile ? (
        <InviteToPlanModal
          visible={inviteVisible}
          mode="friends"
          partnerUserId={targetUserId}
          partnerDisplayName={displayName}
          onClose={() => setInviteVisible(false)}
          onSubmit={handleInviteSubmit}
        />
      ) : null}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return {
    screen: { flex: 1, backgroundColor: theme.colors.background },
    center: { paddingVertical: theme.spacing.huge, alignItems: "center" as const, justifyContent: "center" as const },
    loadingText: { marginTop: theme.spacing.sm, color: theme.colors.textSecondary },
    empty: {
      marginHorizontal: theme.spacing.lg,
      borderWidth: 1,
      borderRadius: theme.radii.lg,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: theme.spacing.lg,
      marginTop: theme.spacing.sm,
    },
    emptyTitle: { ...theme.type.bodyMedium, fontFamily: theme.type.bodyMedium.fontFamily, fontWeight: "900" as const, color: theme.colors.textPrimary },
    emptyBody: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
    cta: { marginTop: theme.spacing.md },
    linkRow: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.md,
      paddingHorizontal: theme.spacing.md,
      marginTop: theme.spacing.sm,
    },
  };
}
