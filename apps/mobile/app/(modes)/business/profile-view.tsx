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
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { chatRoutes } from "@/lib/navigation/modeHub";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { getProfileForMode } from "@/lib/access/profiles";
import { getBusinessConnectionStatus } from "@/lib/access/businessConnections";
import { createDirectChat } from "@/lib/chats/api";
import { InviteModal } from "@/components/business/InviteModal";
import { mapProfilesBusinessRow, type BusinessPersonItem } from "@/lib/business/homeFeed";
import { openPlanTogetherCreateEvent } from "@/lib/social/planTogether";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
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
  const [inviteVisible, setInviteVisible] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

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

      const row = await getProfileForMode("business", viewerId, userId);
      if (!row) {
        setProfile(null);
        return;
      }

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
          viewerId,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  const refreshConnectionStatus = useCallback(async () => {
    if (!userId) return;
    try {
      const status = await getBusinessConnectionStatus(userId);
      setConnectionStatus(status);
    } catch {
      setConnectionStatus("none");
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

  const onConnect = () => {
    if (connectionStatus === "accepted") {
      void onMessage();
      return;
    }
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
    setInviteVisible(true);
  };

  const onMessage = async () => {
    const targetId = profile?.user_id ?? profile?.id;
    if (!targetId) return;
    if (connectionStatus !== "accepted") {
      Alert.alert("Message", "Connect first — accepted connections can chat.");
      return;
    }
    try {
      setActionBusy(true);
      const { data: auth } = await supabase.auth.getUser();
      const meId = auth?.user?.id;
      if (!meId) throw new Error("Not signed in");
      const chatId = await createDirectChat(targetId, "business", "connection", meId);
      Haptics.selectionAsync();
      router.push(
        chatRoutes.conversation("business", chatId) as Parameters<typeof router.push>[0]
      );
    } catch (e) {
      Alert.alert("Message", e instanceof Error ? e.message : "Could not open chat.");
    } finally {
      setActionBusy(false);
    }
  };

  const onPlanMeeting = () => {
    if (!profile) return;
    const targetId = profile.user_id ?? profile.id;
    if (!targetId) return;
    openPlanTogetherCreateEvent(router, {
      partnerUserId: targetId,
      partnerDisplayName: fullName(profile),
      sourceMode: "business",
    });
  };

  const connectLabel =
    connectionStatus === "accepted"
      ? "Connected"
      : connectionStatus === "pending_sent"
        ? "Invite sent"
        : connectionStatus === "pending_received"
          ? "Respond on Home"
          : "Connect";

  return (
    <View style={[styles.screen, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: Colors.card, borderColor: Colors.border }]}
          activeOpacity={0.9}
        >
          <Text style={{ color: Colors.text, fontWeight: "900" }}>‹</Text>
        </TouchableOpacity>

        <Text style={[styles.title, Typography.h2]}>Profile</Text>

        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
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
            {/* Top card */}
            <View style={[styles.profileCard, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
              <Text style={[styles.name, { color: Colors.text }]}>{fullName(profile)}</Text>

              <Text style={{ color: Colors.mutedText, marginTop: 6 }}>
                {[profile.role_title, profile.company_name].filter(Boolean).join(" · ") || "Business profile"}
              </Text>

              <Text style={{ color: Colors.mutedText, marginTop: 6 }}>
                {profile.city?.trim()
                  ? normalizeLocationDisplayString(profile.city, i18n?.language ?? "en")
                  : "Location not specified"}
              </Text>

              {/* Actions */}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  onPress={onConnect}
                  disabled={actionBusy || connectionStatus === "pending_sent"}
                  style={[
                    styles.actionPrimary,
                    {
                      backgroundColor: Colors.business?.primary ?? Colors.primaryViolet,
                      opacity: connectionStatus === "pending_sent" ? 0.65 : 1,
                    },
                  ]}
                  activeOpacity={0.9}
                >
                  <Text style={{ color: Colors.white, fontWeight: "900" }}>{connectLabel}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => void onMessage()}
                  disabled={actionBusy || connectionStatus !== "accepted"}
                  style={[
                    styles.actionSecondary,
                    {
                      backgroundColor: Colors.backgroundMuted,
                      borderColor: Colors.gray200,
                      opacity: connectionStatus !== "accepted" ? 0.55 : 1,
                    },
                  ]}
                  activeOpacity={0.9}
                >
                  <Text style={{ color: Colors.textPrimary, fontWeight: "900" }}>Message</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={onPlanMeeting}
                style={[
                  styles.actionSecondary,
                  {
                    marginTop: 10,
                    backgroundColor: Colors.backgroundMuted,
                    borderColor: Colors.gray200,
                  },
                ]}
                activeOpacity={0.9}
              >
                <Text style={{ color: Colors.textPrimary, fontWeight: "900" }}>Plan together</Text>
              </TouchableOpacity>
            </View>

            {/* About */}
            <View style={[styles.block, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
              <Text style={[styles.blockTitle, { color: Colors.text }]}>About</Text>
              <Text style={{ color: Colors.text, lineHeight: 20 }}>
                {profile.bio?.trim() || "No bio yet."}
              </Text>
            </View>

            {/* Skills */}
            <View style={[styles.block, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
              <Text style={[styles.blockTitle, { color: Colors.text }]}>Skills</Text>
              {profile.skills && profile.skills.length ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
                  {profile.skills.slice(0, 24).map((s, idx) => (
                    <View key={`${s}-${idx}`} style={[styles.skillChip, { backgroundColor: Colors.background, borderColor: Colors.border }]}>
                      <Text style={{ color: Colors.text, fontWeight: "700" }}>{s}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ color: Colors.mutedText, marginTop: 8 }}>No skills listed.</Text>
              )}
            </View>

            {/* Links */}
            <View style={[styles.block, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
              <Text style={[styles.blockTitle, { color: Colors.text }]}>Links</Text>

              <View style={{ marginTop: 10, gap: 10 }}>
                <View style={[styles.linkRow, { backgroundColor: Colors.background, borderColor: Colors.border }]}>
                  <Text style={{ color: Colors.mutedText, width: 90 }}>Website</Text>
                  <Text style={{ color: Colors.text, flex: 1 }} numberOfLines={1}>
                    {profile.website || "—"}
                  </Text>
                </View>

                <View style={[styles.linkRow, { backgroundColor: Colors.background, borderColor: Colors.border }]}>
                  <Text style={{ color: Colors.mutedText, width: 90 }}>LinkedIn</Text>
                  <Text style={{ color: Colors.text, flex: 1 }} numberOfLines={1}>
                    {profile.linkedin_url || "—"}
                  </Text>
                </View>

                <View style={[styles.linkRow, { backgroundColor: Colors.background, borderColor: Colors.border }]}>
                  <Text style={{ color: Colors.mutedText, width: 90 }}>Instagram</Text>
                  {profile.instagram?.trim() ? (
                    <TouchableOpacity
                      onPress={() => {
                        const h = profile.instagram!.trim().replace(/^@/, "").replace(/.*instagram\.com\//, "").split("/")[0];
                        if (h) Linking.openURL(`https://instagram.com/${h}`);
                      }}
                      style={{ flex: 1 }}
                    >
                      <Text style={{ color: Colors.primaryViolet, textDecorationLine: "underline" }} numberOfLines={1}>
                        {profile.instagram.trim().startsWith("http") ? profile.instagram.trim() : `instagram.com/${profile.instagram.trim().replace(/^@/, "")}`}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={{ color: Colors.mutedText, flex: 1 }}>—</Text>
                  )}
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {inviteTarget ? (
        <InviteModal
          visible={inviteVisible}
          target={inviteTarget}
          onClose={() => setInviteVisible(false)}
          onSent={() => {
            setInviteVisible(false);
            void refreshConnectionStatus();
          }}
        />
      ) : null}
    </View>
  );
}

const styles: any = {
  screen: { flex: 1, paddingTop: Layout?.screenTopPadding ?? 16 },
  header: {
    paddingHorizontal: Layout?.screenPadding ?? 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontWeight: "800" },

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

  actionPrimary: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center" },
  actionSecondary: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center", borderWidth: 1 },

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
