import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  Dimensions,
} from "react-native";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { getProfileForMode } from "@/lib/access/profiles";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
import { Colors, Typography, Layout } from "@/constants/tokens";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

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

      const row = await getProfileForMode("friends", viewerId, userId);
      setProfile(row ? (row as FriendProfile) : null);
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
            {/* Main photo (Friends sub-profile photo so you can decide before liking) */}
            {(() => {
              const photoList = (profile.photos ?? []).filter((p): p is string => !!p);
              const mainPhoto = profile.main_photo_url ?? profile.avatar_url ?? photoList[0] ?? null;
              return (
                <View style={[styles.photoSection, { backgroundColor: Colors.gray200 }]}>
                  {mainPhoto ? (
                    <Image source={{ uri: mainPhoto }} style={styles.mainPhoto} resizeMode="cover" />
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <Text style={{ fontSize: 40 }}>📷</Text>
                    </View>
                  )}
                </View>
              );
            })()}

            {/* Photo gallery (additional Friends sub-profile photos) */}
            {(() => {
              const photoList = (profile.photos ?? []).filter((p): p is string => !!p);
              if (photoList.length <= 1) return null;
              return (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.galleryScroll}
                  contentContainerStyle={styles.galleryContent}
                >
                  {photoList.slice(1, 10).map((uri, idx) => (
                    <View key={`${uri}-${idx}`} style={styles.galleryThumb}>
                      <Image source={{ uri }} style={styles.galleryThumbImage} resizeMode="cover" />
                    </View>
                  ))}
                </ScrollView>
              );
            })()}

            {/* Top card */}
            <View style={[styles.profileCard, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
              <Text style={[styles.name, { color: Colors.text }]}>{fullName(profile)}</Text>

              <Text style={{ color: Colors.mutedText, marginTop: 6 }}>
                {profile.city?.trim()
                  ? normalizeLocationDisplayString(profile.city, i18n?.language ?? "en")
                  : "Location not specified"}{" "}
                · Friends mode
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
  photoSection: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 1.1,
    alignSelf: "center",
  },
  mainPhoto: { width: "100%", height: "100%" },
  photoPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  galleryScroll: { marginTop: 12 },
  galleryContent: { paddingHorizontal: Layout?.screenPadding ?? 16, gap: 10, paddingBottom: 8 },
  galleryThumb: {
    width: 90,
    height: 120,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: Colors.gray200,
  },
  galleryThumbImage: { width: "100%", height: "100%" },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
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
