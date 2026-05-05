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
import { supabase } from "@/lib/supabase";
import { Colors, Typography, Layout } from "@/constants/tokens";

type FriendProfile = {
  id: string; // profile id
  user_id?: string | null;

  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;

  city?: string | null;
  about?: string | null;

  vibe_tags?: string[] | null;
  interests?: string[] | null;

  main_photo_url?: string | null;
  avatar_url?: string | null;

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
  const router = useRouter();
  const params = useLocalSearchParams<{ user_id?: string }>();

  const userId = useMemo(() => (typeof params.user_id === "string" ? params.user_id : ""), [params.user_id]);

  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile() {
    try {
      setLoading(true);

      if (!userId || !isUuid(userId)) {
        setProfile(null);
        return;
      }

      // Prefer friend_profiles; fallback to user_profiles.
      const { data, error } = await supabase
        .from("friend_profiles")
        .select(
          "id,user_id,display_name,first_name,last_name,city,about,vibe_tags,interests,main_photo_url,avatar_url,instagram,created_at"
        )
        .or(`user_id.eq.${userId},id.eq.${userId}`)
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setProfile(data as FriendProfile);
        return;
      }

      const fb = await supabase
        .from("user_profiles")
        .select("id,first_name,last_name,city,about,main_photo_url,avatar_url,instagram,created_at")
        .eq("id", userId)
        .maybeSingle();

      if (fb.error || !fb.data) {
        setProfile(null);
        return;
      }

      setProfile({
        id: fb.data.id,
        user_id: fb.data.id,
        first_name: fb.data.first_name ?? null,
        last_name: fb.data.last_name ?? null,
        city: fb.data.city ?? null,
        about: (fb.data as any).about ?? null,
        main_photo_url: (fb.data as any).main_photo_url ?? null,
        avatar_url: (fb.data as any).avatar_url ?? null,
        instagram: (fb.data as any).instagram ?? null,
        created_at: fb.data.created_at ?? null,
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const onSendFriendRequest = async () => {
    // Placeholder: wire to friend_requests table later
    Alert.alert("Friends", "Friend request flow can be added next (friend_requests table + RLS).");
  };

  const onMessage = async () => {
    // Placeholder: wire to direct chat later
    Alert.alert("Message", "Direct chat routing can be connected once conversations for Friends are wired.");
  };

  const onPlanHangout = () => {
    router.push("/(modes)/friends/planner");
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
            {/* Top card */}
            <View style={[styles.profileCard, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
              <Text style={[styles.name, { color: Colors.text }]}>{fullName(profile)}</Text>

              <Text style={{ color: Colors.mutedText, marginTop: 6 }}>
                {profile.city || "Location not specified"} · Friends mode
              </Text>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  onPress={onSendFriendRequest}
                  style={[styles.actionPrimary, { backgroundColor: Colors.friends.primary }]}
                  activeOpacity={0.9}
                >
                  <Text style={{ color: Colors.onPrimary, fontWeight: "900" }}>Add friend</Text>
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
                onPress={onPlanHangout}
                style={[
                  styles.actionSecondary,
                  { marginTop: 10, backgroundColor: Colors.background, borderColor: Colors.border },
                ]}
                activeOpacity={0.9}
              >
                <Text style={{ color: Colors.text, fontWeight: "900" }}>Plan a hangout</Text>
              </TouchableOpacity>
            </View>

            {/* About */}
            <View style={[styles.block, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
              <Text style={[styles.blockTitle, { color: Colors.text }]}>About</Text>
              <Text style={{ color: Colors.text, lineHeight: 20 }}>
                {profile.about?.trim() || "No bio yet."}
              </Text>
            </View>

            {/* Vibes */}
            <View style={[styles.block, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
              <Text style={[styles.blockTitle, { color: Colors.text }]}>Vibes</Text>

              {(profile.vibe_tags ?? []).length ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
                  {(profile.vibe_tags ?? []).slice(0, 24).map((s, idx) => (
                    <View
                      key={`${s}-${idx}`}
                      style={[styles.chip, { backgroundColor: Colors.background, borderColor: Colors.border }]}
                    >
                      <Text style={{ color: Colors.text, fontWeight: "700" }}>{s}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ color: Colors.mutedText, marginTop: 8 }}>No vibes listed.</Text>
              )}
            </View>

            {/* Interests */}
            <View style={[styles.block, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
              <Text style={[styles.blockTitle, { color: Colors.text }]}>Interests</Text>

              {(profile.interests ?? []).length ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
                  {(profile.interests ?? []).slice(0, 24).map((s, idx) => (
                    <View
                      key={`${s}-${idx}`}
                      style={[styles.chip, { backgroundColor: Colors.background, borderColor: Colors.border }]}
                    >
                      <Text style={{ color: Colors.text, fontWeight: "700" }}>{s}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ color: Colors.mutedText, marginTop: 8 }}>No interests listed.</Text>
              )}
            </View>

            {/* Links */}
            <View style={[styles.block, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
              <Text style={[styles.blockTitle, { color: Colors.text }]}>Links</Text>

              <View style={{ marginTop: 10, gap: 10 }}>
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
  title: { fontWeight: "900" },

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
