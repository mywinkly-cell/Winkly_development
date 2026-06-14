import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
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
import { Colors, Typography, Layout } from "@/constants/tokens";

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
    <View style={[styles.screen, { backgroundColor: Colors.backgroundLight }]}>
      <ProfileViewHeader
        onBack={() => router.back()}
        mode="friends"
        onPlannerPress={handlePlannerPress}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.friends.primary} />
            <Text style={{ marginTop: 10, color: Colors.mutedText }}>Loading profile…</Text>
          </View>
        ) : !profile ? (
          <View style={[styles.empty, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
            <Text style={{ color: Colors.text, fontWeight: "900" }}>Profile not found</Text>
            <Text style={{ color: Colors.mutedText, marginTop: 6, lineHeight: 18 }}>
              This usually means the Friends profile table isn’t connected yet or the user_id is missing.
            </Text>

            <TouchableOpacity
              onPress={() => router.push("/(modes)/friends/discover")}
              style={[styles.cta, { backgroundColor: Colors.friends.primary }]}
              activeOpacity={0.9}
            >
              <Text style={{ color: Colors.onPrimary, fontWeight: "900" }}>Back to Discover</Text>
            </TouchableOpacity>
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
              <View style={{ paddingHorizontal: Layout?.screenPadding ?? 16, marginTop: 8 }}>
                <ProfileConnectionActions
                  mode="friends"
                  primaryColor={Colors.friends.primary}
                  busy={actionBusy}
                  hasChat={!!chatId}
                  onChat={() => void handleChat()}
                  onRemove={handleRemoveConnection}
                />
                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: "/groups/create-group",
                      params: { mode: "friends", preselect: targetUserId },
                    })
                  }
                  style={[styles.linkRow, { borderColor: Colors.border, backgroundColor: Colors.card, marginTop: 10 }]}
                  activeOpacity={0.9}
                >
                  <Text style={{ color: Colors.text, fontWeight: "700" }}>Add to a group</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ProfileSwipeActions
                mode="friends"
                primaryColor={Colors.friends.primary}
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

const styles: any = {
  screen: { flex: 1 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  center: { paddingVertical: 40, alignItems: "center", justifyContent: "center" },

  empty: {
    marginHorizontal: Layout?.screenPadding ?? 16,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginTop: 10,
  },
  cta: { marginTop: 12, borderRadius: 14, paddingVertical: 12, alignItems: "center" },

  profileCard: {
    marginHorizontal: Layout?.screenPadding ?? 16,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginTop: 8,
  },
  name: { fontSize: 20, fontWeight: "900" },

  block: {
    marginHorizontal: Layout?.screenPadding ?? 16,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginTop: 12,
  },
  blockTitle: { fontSize: 16, fontWeight: "900" },

  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },

  linkRow: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
};
