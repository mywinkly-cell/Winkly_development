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
import { getBusinessConnectionStatus } from "@/lib/access/businessConnections";
import { getProfileConnectionStatus } from "@/lib/access/profileConnectionStatus";
import { confirmRemoveConnection, removeModeConnection } from "@/lib/access/removeConnection";
import { createDirectChat } from "@/lib/chats/api";
import { InviteModal } from "@/components/business/InviteModal";
import { ProfileViewHeader } from "@/components/profile/ProfileViewHeader";
import { ProfileSwipeActions } from "@/components/profile/ProfileSwipeActions";
import { ProfileConnectionActions } from "@/components/profile/ProfileConnectionActions";
import { mapProfilesBusinessRow, type BusinessPersonItem } from "@/lib/business/homeFeed";
import { InviteToPlanModal, type InviteFormValues } from "@/components/chats/InviteToPlanModal";
import {
  promptConnectBeforeInvite,
  submitProfilePlannerInvite,
} from "@/lib/profile/profilePlanInvite";
import {
  getOtherUserCoreFields,
  type OtherUserCoreFields,
} from "@/lib/profile/otherUserCore";
import {
  normalizeModeProfileRow,
  emptyPublicCoreProfile,
  type PublicModeProfileRow,
} from "@/lib/profile/publicModeProfile";
import { ModeProfilePublicView } from "@/components/profile/ModeProfilePublicView";
import { recordBusinessAnalyticsEvent } from "@/lib/business/analyticsStore";
import { Colors, Typography, Layout } from "@/constants/tokens";
import type { BusinessConnectionStatus } from "@/types/business";

type BusinessProfile = {
  id: string; // user_id or profile id
  user_id?: string | null;

  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;

  role_title?: string | null;
  company_name?: string | null;
  city?: string | null;

  bio?: string | null;
  skills?: string[] | null;

  main_photo_url?: string | null;
  avatar_url?: string | null;

  website?: string | null;
  linkedin_url?: string | null;
  instagram?: string | null;

  created_at?: string | null;
};

function fullName(p: BusinessProfile) {
  const fn = (p.first_name ?? "").trim();
  const ln = (p.last_name ?? "").trim();
  const dn = (p.display_name ?? "").trim();
  const composed = `${fn} ${ln}`.trim();
  return composed || dn || "Professional";
}

export default function BusinessProfileView() {
  const { i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ user_id?: string }>();

  const userId = useMemo(() => (typeof params.user_id === "string" ? params.user_id : ""), [params.user_id]);

  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<BusinessConnectionStatus>("none");
  const [connectInviteVisible, setConnectInviteVisible] = useState(false);
  const [planInviteVisible, setPlanInviteVisible] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [coreFields, setCoreFields] = useState<OtherUserCoreFields | null>(null);
  const [modeRow, setModeRow] = useState<PublicModeProfileRow | null>(null);

  async function loadProfile() {
    try {
      setLoading(true);

      if (!userId) {
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
        getProfileForMode("business", viewerId, userId),
        getOtherUserCoreFields(userId),
      ]);
      setCoreFields(core);
      if (!row) {
        setProfile(null);
        setModeRow(null);
        return;
      }

      setModeRow(normalizeModeProfileRow("business", row as Record<string, unknown>));
      setProfile({
        id: String(row.id ?? row.user_id ?? userId),
        user_id: String(row.user_id ?? row.id ?? userId),
        display_name: (row.display_name as string | null) ?? null,
        first_name: (row.first_name as string | null) ?? null,
        last_name: (row.last_name as string | null) ?? null,
        role_title:
          (row.role_title as string | null) ??
          ((row.meta as Record<string, unknown> | undefined)?.role as string | undefined) ??
          null,
        company_name:
          (row.company_name as string | null) ??
          (row.business_name as string | null) ??
          ((row.meta as Record<string, unknown> | undefined)?.company as string | null) ??
          null,
        city: (row.city as string | null) ?? (row.location as string | null) ?? null,
        bio: (row.bio as string | null) ?? null,
        skills: Array.isArray(row.skills)
          ? (row.skills as string[])
          : Array.isArray(row.tags)
            ? (row.tags as string[])
            : Array.isArray(row.interests)
              ? (row.interests as string[])
              : null,
        main_photo_url:
          (row.main_photo_url as string | null) ??
          (row.logo_uri as string | null) ??
          null,
        avatar_url:
          (row.avatar_url as string | null) ??
          (row.logo_uri as string | null) ??
          null,
        website: (row.website as string | null) ?? null,
        linkedin_url: (row.linkedin as string | null) ?? (row.linkedin_url as string | null) ?? null,
        instagram: (row.instagram as string | null) ?? null,
        created_at: (row.created_at as string | null) ?? null,
      });

      if (viewerId !== userId) {
        void recordBusinessAnalyticsEvent({
          businessId: userId,
          eventType: "profile_view",
          metadata: { viewer_id: viewerId, source: "business_profile_view" },
        });
      }
    } finally {
      setLoading(false);
    }
  }

  const refreshConnectionStatus = useCallback(async () => {
    if (!userId) return;
    try {
      const { data: auth } = await supabase.auth.getUser();
      const viewerId = auth?.user?.id;
      const status = await getBusinessConnectionStatus(userId);
      setConnectionStatus(status);
      if (viewerId && status === "accepted") {
        const connection = await getProfileConnectionStatus("business", viewerId, userId);
        setChatId(connection.chatId);
      } else {
        setChatId(null);
      }
    } catch {
      setConnectionStatus("none");
      setChatId(null);
    }
  }, [userId]);

  useEffect(() => {
    loadProfile();
    void refreshConnectionStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const inviteTarget: BusinessPersonItem | null = useMemo(() => {
    if (!profile?.user_id && !profile?.id) return null;
    const uid = profile.user_id ?? profile.id;
    return mapProfilesBusinessRow({
      id: uid,
      user_id: uid,
      first_name: profile.first_name,
      last_name: profile.last_name,
      business_name: profile.company_name,
      role: profile.role_title,
      city: profile.city,
      bio: profile.bio,
      logo_uri: profile.main_photo_url ?? profile.avatar_url,
      tags: profile.skills,
    });
  }, [profile]);

  const targetId = profile?.user_id ?? profile?.id ?? userId;
  const isConnected = connectionStatus === "accepted";

  const coreForView = useMemo(
    () => coreFields ?? emptyPublicCoreProfile(),
    [coreFields]
  );

  const openConnectFlow = useCallback(() => {
    if (connectionStatus === "pending_sent") {
      Alert.alert("Connect", "Your invite is pending — they will be notified.");
      return;
    }
    if (connectionStatus === "pending_received") {
      Alert.alert("Connect", "Check your pending invites on Business Home.");
      return;
    }
    if (connectionStatus === "blocked" || connectionStatus === "declined") {
      Alert.alert("Connect", "You cannot connect with this person right now.");
      return;
    }
    setConnectInviteVisible(true);
  }, [connectionStatus]);

  const handleChat = useCallback(async () => {
    if (!targetId || actionBusy) return;
    setActionBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const meId = auth?.user?.id;
      if (!meId) throw new Error("Not signed in");
      const id = chatId ?? (await createDirectChat(targetId, "business", "connection", meId));
      setChatId(id);
      Haptics.selectionAsync();
      router.push(chatRoutes.conversation("business", id) as Parameters<typeof router.push>[0]);
    } catch (e) {
      Alert.alert("Message", e instanceof Error ? e.message : "Could not open chat.");
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, chatId, router, targetId]);

  const handleRemoveConnection = useCallback(() => {
    if (!profile || !targetId) return;
    confirmRemoveConnection({
      mode: "business",
      firstName: fullName(profile),
      onConfirm: async () => {
        setActionBusy(true);
        try {
          await removeModeConnection(targetId, "business");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
        } catch {
          Alert.alert("Error", "Could not remove contact. Please try again.");
        } finally {
          setActionBusy(false);
        }
      },
    });
  }, [profile, router, targetId]);

  const handlePlannerPress = useCallback(() => {
    if (!targetId) return;
    if (!isConnected) {
      promptConnectBeforeInvite("business");
      return;
    }
    setPlanInviteVisible(true);
  }, [isConnected, targetId]);

  const handleInviteSubmit = useCallback(
    async (values: InviteFormValues) => {
      if (!meId || !targetId) throw new Error("Missing user");
      await submitProfilePlannerInvite({
        meId,
        targetUserId: targetId,
        mode: "business",
        chatId,
        isConnected,
        values,
      });
      setPlanInviteVisible(false);
      Alert.alert("Invite sent", "Your meeting suggestion was sent in chat.");
    },
    [chatId, isConnected, meId, targetId]
  );

  return (
    <View style={[styles.screen, { backgroundColor: Colors.backgroundLight }]}>
      <ProfileViewHeader
        onBack={() => router.back()}
        mode="business"
        onPlannerPress={handlePlannerPress}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.business.primary} />
            <Text style={{ marginTop: 10, color: Colors.mutedText }}>Loading profile…</Text>
          </View>
        ) : !profile ? (
          <View style={[styles.empty, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
            <Text style={{ color: Colors.text, fontWeight: "900" }}>Profile not found</Text>
            <Text style={{ color: Colors.mutedText, marginTop: 6, lineHeight: 18 }}>
              This usually means the Business profile table isn’t connected yet or the user_id is missing.
            </Text>

            <TouchableOpacity
              onPress={() => router.push("/(modes)/business/discover")}
              style={[styles.cta, { backgroundColor: Colors.primary }]}
              activeOpacity={0.9}
            >
              <Text style={{ color: Colors.onPrimary, fontWeight: "800" }}>Back to Discover</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <ModeProfilePublicView
              mode="business"
              core={coreForView}
              modeRow={modeRow}
              locale={i18n?.language ?? "en"}
            />

            {isConnected ? (
              <View style={{ paddingHorizontal: Layout?.screenPadding ?? 16 }}>
                <ProfileConnectionActions
                  mode="business"
                  primaryColor={Colors.business.primary}
                  busy={actionBusy}
                  hasChat={!!chatId}
                  onChat={() => void handleChat()}
                  onRemove={handleRemoveConnection}
                />
              </View>
            ) : (
              <ProfileSwipeActions
                mode="business"
                primaryColor={Colors.business.primary}
                disabled={actionBusy || connectionStatus === "pending_sent"}
                superDisabled={connectionStatus === "pending_sent"}
                onPass={() => router.back()}
                onSuper={openConnectFlow}
                onLike={openConnectFlow}
              />
            )}
          </>
        )}
      </ScrollView>

      {inviteTarget ? (
        <InviteModal
          visible={connectInviteVisible}
          target={inviteTarget}
          onClose={() => setConnectInviteVisible(false)}
          onSent={() => {
            setConnectInviteVisible(false);
            void refreshConnectionStatus();
          }}
        />
      ) : null}

      {profile ? (
        <InviteToPlanModal
          visible={planInviteVisible}
          mode="business"
          partnerUserId={targetId}
          partnerDisplayName={fullName(profile)}
          onClose={() => setPlanInviteVisible(false)}
          onSubmit={handleInviteSubmit}
        />
      ) : null}
    </View>
  );
}

const styles: any = {
  screen: { flex: 1 },
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

  skillChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },

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
