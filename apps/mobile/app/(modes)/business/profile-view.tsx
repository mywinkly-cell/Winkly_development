import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { getProfileForMode } from "@/lib/access/profiles";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
import { Colors, Typography, Layout } from "@/constants/tokens";

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
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const onConnect = async () => {
    // Safe placeholder: you can later create conversations + participants rows here.
    Alert.alert("Connect", "Connection request flow can be wired to your chat + requests tables next.");
  };

  const onMessage = () => {
    // Safe placeholder: route to a chat screen if exists.
    Alert.alert("Message", "Chat routing can be connected once conversations are in place.");
  };

  const onPlanMeeting = () => {
    // Navigate to Planner (you can later pass params for prefilling)
    router.push("/(modes)/business/planner");
  };

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
            <ActivityIndicator />
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
                  style={[styles.actionPrimary, { backgroundColor: Colors.primary }]}
                  activeOpacity={0.9}
                >
                  <Text style={{ color: Colors.onPrimary, fontWeight: "900" }}>Connect</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={onMessage}
                  style={[styles.actionSecondary, { backgroundColor: Colors.background, borderColor: Colors.border }]}
                  activeOpacity={0.9}
                >
                  <Text style={{ color: Colors.text, fontWeight: "900" }}>Message</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={onPlanMeeting}
                style={[styles.actionSecondary, { marginTop: 10, backgroundColor: Colors.background, borderColor: Colors.border }]}
                activeOpacity={0.9}
              >
                <Text style={{ color: Colors.text, fontWeight: "900" }}>Plan a meeting</Text>
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
