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
  mergePhotoUrls,
  metaStringArray,
  type OtherUserCoreFields,
} from "@/lib/profile/otherUserCore";
import {
  ProfileChipList,
  ProfileGeneralBlock,
  ProfileInstagramLink,
  ProfilePhotoGallery,
  ProfileSection,
} from "@/components/profile/OtherUserProfileSections";
import { ProfileViewHeader } from "@/components/profile/ProfileViewHeader";
import { ProfileSwipeActions } from "@/components/profile/ProfileSwipeActions";
import { ProfileConnectionActions } from "@/components/profile/ProfileConnectionActions";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
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

function fullName(p: FriendProfile) {
  const fn = (p.first_name ?? "").trim();
  const ln = (p.last_name ?? "").trim();
  const dn = (p.display_name ?? "").trim();
  const composed = `${fn} ${ln}`.trim();
  return composed || dn || "Friend";
}

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

  const photos = useMemo(() => {
    if (!profile) return [] as string[];
    const modePhotos = (profile.photos ?? []).filter((p): p is string => !!p);
    const fallbacks = [profile.main_photo_url, profile.avatar_url].filter((p): p is string => !!p);
    return mergePhotoUrls(modePhotos, fallbacks, coreFields?.core_photos ?? []);
  }, [coreFields?.core_photos, profile]);

  const meetupGoals = useMemo(
    () => metaStringArray(profile?.meta ?? null, "meetup_goals"),
    [profile?.meta]
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
      firstName: fullName(profile),
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
  }, [profile, router, targetUserId]);

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
            <ProfilePhotoGallery photos={photos} />

            <View style={[styles.profileCard, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
              <Text style={[styles.name, { color: Colors.text }]}>{fullName(profile)}</Text>
              <Text style={{ color: Colors.mutedText, marginTop: 6 }}>
                {profile.city?.trim()
                  ? normalizeLocationDisplayString(profile.city, i18n?.language ?? "en")
                  : "Location not specified"}
              </Text>
            </View>

            {coreFields?.bio ||
            coreFields?.education ||
            (coreFields?.activity_preferences?.length ?? 0) > 0 ||
            typeof profile.night_owl === "boolean" ? (
              <View style={[styles.block, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
                <ProfileGeneralBlock
                  coreBio={coreFields?.bio}
                  education={coreFields?.education}
                  activityPreferences={coreFields?.activity_preferences}
                  nightOwl={profile.night_owl}
                />
              </View>
            ) : null}

            <View style={[styles.block, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
              <ProfileSection title="Friends">
                <Text style={{ color: Colors.text, lineHeight: 20 }}>
                  {profile.about?.trim() || "No friends bio yet."}
                </Text>
              </ProfileSection>
            </View>

            {(profile.vibe_tags ?? []).length > 0 ? (
              <View style={[styles.block, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
                <ProfileSection title="Vibes">
                  <ProfileChipList items={(profile.vibe_tags ?? []).slice(0, 24)} />
                </ProfileSection>
              </View>
            ) : null}

            {(profile.interests ?? []).length > 0 ? (
              <View style={[styles.block, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
                <ProfileSection title="Interests">
                  <ProfileChipList items={(profile.interests ?? []).slice(0, 24)} />
                </ProfileSection>
              </View>
            ) : null}

            {meetupGoals.length > 0 ? (
              <View style={[styles.block, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
                <ProfileSection title="Meetup goals">
                  <ProfileChipList items={meetupGoals} />
                </ProfileSection>
              </View>
            ) : null}

            {/* Friends sub-profile details (lifestyle, meetup goals, etc.) */}
            {profile.meta && Object.keys(profile.meta).length > 0 && (
              <View style={[styles.block, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
                <Text style={[styles.blockTitle, { color: Colors.text }]}>Lifestyle & meetup</Text>
                <View style={{ marginTop: 10, gap: 8 }}>
                  {typeof profile.night_owl === "boolean" && (
                    <View style={styles.metaRow}>
                      <Text style={{ color: Colors.mutedText, width: 100 }}>Timing</Text>
                      <Text style={{ color: Colors.text, flex: 1 }}>{profile.night_owl ? "Night owl" : "Early bird"}</Text>
                    </View>
                  )}
                  {!!profile.meta.lifestyle && (
                    <View style={styles.metaRow}>
                      <Text style={{ color: Colors.mutedText, width: 100 }}>Lifestyle</Text>
                      <Text style={{ color: Colors.text, flex: 1 }}>{String(profile.meta.lifestyle)}</Text>
                    </View>
                  )}
                  {!!profile.meta.alcohol && (
                    <View style={styles.metaRow}>
                      <Text style={{ color: Colors.mutedText, width: 100 }}>Alcohol</Text>
                      <Text style={{ color: Colors.text, flex: 1 }}>{String(profile.meta.alcohol)}</Text>
                    </View>
                  )}
                  {!!profile.meta.smoking && (
                    <View style={styles.metaRow}>
                      <Text style={{ color: Colors.mutedText, width: 100 }}>Smoking</Text>
                      <Text style={{ color: Colors.text, flex: 1 }}>{String(profile.meta.smoking)}</Text>
                    </View>
                  )}
                  {!!profile.meta.status && (
                    <View style={styles.metaRow}>
                      <Text style={{ color: Colors.mutedText, width: 100 }}>Status</Text>
                      <Text style={{ color: Colors.text, flex: 1 }}>{String(profile.meta.status)}</Text>
                    </View>
                  )}
                  {!!profile.meta.kids && (
                    <View style={styles.metaRow}>
                      <Text style={{ color: Colors.mutedText, width: 100 }}>Kids</Text>
                      <Text style={{ color: Colors.text, flex: 1 }}>{String(profile.meta.kids)}</Text>
                    </View>
                  )}
                  {Array.isArray(profile.meta.pets) && profile.meta.pets.length > 0 && (
                    <View style={styles.metaRow}>
                      <Text style={{ color: Colors.mutedText, width: 100 }}>Pets</Text>
                      <Text style={{ color: Colors.text, flex: 1 }}>{(profile.meta.pets as string[]).join(", ")}</Text>
                    </View>
                  )}
                  {Array.isArray(profile.meta.allergies) && profile.meta.allergies.length > 0 && (
                    <View style={styles.metaRow}>
                      <Text style={{ color: Colors.mutedText, width: 100 }}>Allergies</Text>
                      <Text style={{ color: Colors.text, flex: 1 }}>{(profile.meta.allergies as string[]).join(", ")}</Text>
                    </View>
                  )}
                  {!!profile.meta.food && (
                    <View style={styles.metaRow}>
                      <Text style={{ color: Colors.mutedText, width: 100 }}>Food</Text>
                      <Text style={{ color: Colors.text, flex: 1 }}>{String(profile.meta.food)}</Text>
                    </View>
                  )}
                  {Array.isArray(profile.meta.meetup_goals) && profile.meta.meetup_goals.length > 0 && (
                    <View style={{ marginTop: 4 }}>
                      <Text style={{ color: Colors.mutedText, marginBottom: 6 }}>Meetup goals</Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {(profile.meta.meetup_goals as string[]).map((g, idx) => (
                          <View
                            key={`${g}-${idx}`}
                            style={[styles.chip, { backgroundColor: Colors.friends.primary + "22", borderColor: Colors.friends.primary }]}
                          >
                            <Text style={{ color: Colors.text, fontWeight: "700" }}>{g}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              </View>
            )}

            {profile.instagram?.trim() ? (
              <View style={[styles.block, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
                <ProfileInstagramLink handle={profile.instagram} />
              </View>
            ) : null}

            {isConnected ? (
              <View style={{ paddingHorizontal: Layout?.screenPadding ?? 16 }}>
                <ProfileConnectionActions
                  mode="friends"
                  primaryColor={Colors.friends.primary}
                  busy={actionBusy}
                  hasChat={!!chatId}
                  onChat={() => void handleChat()}
                  onRemove={handleRemoveConnection}
                />
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
          partnerDisplayName={fullName(profile)}
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
