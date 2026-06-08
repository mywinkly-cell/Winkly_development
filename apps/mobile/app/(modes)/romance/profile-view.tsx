// apps/mobile/app/(modes)/romance/profile-view.tsx
// ────────────────────────────────────────────────
// Winkly Romance Mode – Profile View (v7.1 AI)
// © 2025 Winkly Technologies UG (haftungsbeschränkt)
// Maintainer: Kateryna Shyshkalova
//
// Purpose:
//   • Full-screen view of another user's profile (Romance context)
//   • Uses public_profile_view + AI compatibility logic
//   • Reuses computeCompatibilityScore + buildMatchTags
//   • From Discover/Home/Matches you land here with ?id=USER_ID
// ────────────────────────────────────────────────

import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { chatRoutes } from "@/lib/navigation/modeHub";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";

import { Colors, Typography, Layout } from "@/constants/tokens";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { ProfileViewHeader } from "@/components/profile/ProfileViewHeader";
import { ProfileSwipeActions } from "@/components/profile/ProfileSwipeActions";
import { ProfileConnectionActions } from "@/components/profile/ProfileConnectionActions";
import { supabase } from "@/lib/supabase";
import { getProfileForMode } from "@/lib/access/profiles";
import { getProfileConnectionStatus } from "@/lib/access/profileConnectionStatus";
import { confirmRemoveConnection, removeModeConnection } from "@/lib/access/removeConnection";
import { createDirectChat, romanceLikeProfile } from "@/lib/chats";
import { recordSwipe } from "@/lib/matching/actions";
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
import {
  computeCompatibilityScore,
  buildMatchTags,
  type RomanceProfile,
} from "@/lib/ai/romanceInsights";

type ProfileRow = {
  id: string;
  first_name: string;
  last_name?: string | null;
  age?: number | null;
  city?: string | null;
  interests?: string[] | null;
  languages?: string[] | null;
  occupation?: string | null;
  bio_romance?: string | null;
  night_owl?: boolean | null;
  // Optional lifestyle / extra fields:
  lifestyle_smoking?: string | null;
  lifestyle_drinking?: string | null;
  lifestyle_pets?: string | null;
  lifestyle_kids?: string | null;
  lifestyle_fitness?: string | null;
  lifestyle_food?: string | null;
  lifestyle_religion?: string | null;
  // Media:
  core_photos?: (string | null)[];
  romance_photos?: (string | null)[];
  instagram?: string | null;
  education?: string | null;
  romance_meta?: Record<string, unknown> | null;
  romance_interests?: string[] | null;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUUID(s: string | undefined): boolean {
  return typeof s === "string" && UUID_REGEX.test(s.trim());
}

export default function RomanceProfileView() {
  const { i18n } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [loading, setLoading] = useState(true);
  const [selfProfile, setSelfProfile] = useState<RomanceProfile | null>(null);
  const [targetProfile, setTargetProfile] = useState<ProfileRow | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [coreFields, setCoreFields] = useState<OtherUserCoreFields | null>(null);

  // ────────────────────────────────────────────────
  // Load self + target profile from public_profile_view
  // ────────────────────────────────────────────────
  const loadData = async () => {
    if (!id || !isValidUUID(id)) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        setLoading(false);
        return;
      }
      setMeId(userData.user.id);

      // Self + target via mode-isolated access layer (public_profile_view)
      const [me, other, core] = await Promise.all([
        getProfileForMode("romance", userData.user.id, userData.user.id),
        getProfileForMode("romance", userData.user.id, id),
        getOtherUserCoreFields(id),
      ]);
      setCoreFields(core);

      if (me) {
        setSelfProfile({
          id: String(me.id),
          first_name: me.first_name as string,
          age: (me.age as number | null) ?? undefined,
          city: (me.city as string | null) ?? undefined,
          interests: (me.interests as string[] | null) ?? (me.romance_interests as string[] | null) ?? [],
          languages: (me.languages as string[] | null) ?? [],
          occupation: (me.occupation as string | null) ?? undefined,
          bio_romance: (me.bio_romance as string | null) ?? undefined,
          compatibility: me.compatibility as number | undefined,
        });
      }

      if (other) {
        setTargetProfile(other as ProfileRow);
        const connection = await getProfileConnectionStatus("romance", userData.user.id, id);
        setIsConnected(connection.isConnected);
        setChatId(connection.chatId);
      }
    } catch (err) {
      console.warn("RomanceProfileView loadData error", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ────────────────────────────────────────────────
  // Derived data: AI compatibility, tags, photos
  // ────────────────────────────────────────────────
  const ai = useMemo(() => {
    if (!targetProfile) {
      return {
        score: 0,
        tags: [] as string[],
      };
    }

    const other: RomanceProfile = {
      id: targetProfile.id,
      first_name: targetProfile.first_name,
      age: targetProfile.age ?? undefined,
      city: targetProfile.city ?? undefined,
      interests: targetProfile.interests || [],
      languages: targetProfile.languages || [],
      occupation: targetProfile.occupation || undefined,
      bio_romance: targetProfile.bio_romance || undefined,
      compatibility: undefined,
    };

    const score = computeCompatibilityScore({
      self: selfProfile,
      other,
    });

    const tags = buildMatchTags({
      self: selfProfile,
      other,
    });

    return { score, tags };
  }, [selfProfile, targetProfile]);

  const photos: string[] = useMemo(() => {
    if (!targetProfile) return [];
    const romance = (targetProfile.romance_photos || []).filter((p): p is string => !!p);
    const core = (targetProfile.core_photos || []).filter((p): p is string => !!p);
    return mergePhotoUrls(romance, core, coreFields?.core_photos ?? []);
  }, [coreFields?.core_photos, targetProfile]);

  const romanceInterests = useMemo(() => {
    if (!targetProfile) return [] as string[];
    const fromMode = (targetProfile.romance_interests ?? []).filter(Boolean) as string[];
    const fromCore = (targetProfile.interests ?? []).filter(Boolean) as string[];
    return Array.from(new Set([...fromMode, ...fromCore]));
  }, [targetProfile]);

  const relationshipGoals = useMemo(
    () =>
      metaStringArray(
        targetProfile?.romance_meta ?? null,
        "relationship_goals"
      ).concat(metaStringArray(targetProfile?.romance_meta ?? null, "relationship_goal")),
    [targetProfile?.romance_meta]
  );

  // ────────────────────────────────────────────────
  // Handlers
  // ────────────────────────────────────────────────
  const onBack = () => {
    router.back();
  };

  const handlePlannerPress = useCallback(() => {
    if (!targetProfile) return;
    if (!isConnected) {
      promptConnectBeforeInvite("romance");
      return;
    }
    setInviteVisible(true);
  }, [isConnected, targetProfile]);

  const handleInviteSubmit = useCallback(
    async (values: InviteFormValues) => {
      if (!meId || !targetProfile) throw new Error("Missing user");
      await submitProfilePlannerInvite({
        meId,
        targetUserId: targetProfile.id,
        mode: "romance",
        chatId,
        isConnected,
        values,
      });
      setInviteVisible(false);
      Alert.alert("Invite sent", "Your date invite was sent in chat.");
    },
    [chatId, isConnected, meId, targetProfile]
  );

  const handlePass = useCallback(async () => {
    if (!targetProfile || actionBusy) return;
    setActionBusy(true);
    try {
      await recordSwipe({ mode: "romance", targetUserId: targetProfile.id, action: "pass" });
      Haptics.selectionAsync();
      router.back();
    } catch {
      Alert.alert("Error", "Could not save your choice. Please try again.");
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, router, targetProfile]);

  const handleLike = useCallback(async () => {
    if (!targetProfile || actionBusy) return;
    setActionBusy(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const result = await romanceLikeProfile(targetProfile.id);
      if (result?.is_match && result?.chat_id) {
        setIsConnected(true);
        setChatId(result.chat_id);
        Alert.alert("It's a match! 💖", "You both liked each other. Start chatting?", [
          { text: "Later" },
          {
            text: "Chat",
            onPress: () =>
              router.push(
                chatRoutes.conversation("romance", result.chat_id!, { matchBridge: "1" }) as Parameters<
                  typeof router.push
                >[0]
              ),
          },
        ]);
      } else {
        router.back();
      }
    } catch {
      Alert.alert("Error", "Could not send like. Please try again.");
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, router, targetProfile]);

  const handleSuperLike = useCallback(async () => {
    if (!targetProfile || actionBusy) return;
    setActionBusy(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const result = await romanceLikeProfile(targetProfile.id, { superLike: true });
      if (result?.is_match && result?.chat_id) {
        setIsConnected(true);
        setChatId(result.chat_id);
      } else {
        router.back();
      }
    } catch {
      Alert.alert("Error", "Could not send Super Like. Please try again.");
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, router, targetProfile]);

  const handleChat = useCallback(async () => {
    if (!targetProfile || actionBusy) return;
    setActionBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const meId = userData?.user?.id;
      if (!meId) throw new Error("Not signed in");
      const id =
        chatId ?? (await createDirectChat(targetProfile.id, "romance", "match", meId));
      setChatId(id);
      router.push(chatRoutes.conversation("romance", id) as Parameters<typeof router.push>[0]);
    } catch {
      Alert.alert("Error", "Could not open chat.");
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, chatId, router, targetProfile]);

  const handleRemoveConnection = useCallback(() => {
    if (!targetProfile) return;
    confirmRemoveConnection({
      mode: "romance",
      firstName: targetProfile.first_name,
      onConfirm: async () => {
        setActionBusy(true);
        try {
          await removeModeConnection(targetProfile.id, "romance");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
        } catch {
          Alert.alert("Error", "Could not unmatch. Please try again.");
        } finally {
          setActionBusy(false);
        }
      },
    });
  }, [router, targetProfile]);

  // ────────────────────────────────────────────────
  // Lifestyle chips helper
  // ────────────────────────────────────────────────
  const lifestyleChips = useMemo(() => {
    if (!targetProfile) return [] as string[];

    const chips: string[] = [];
    if (typeof targetProfile.night_owl === "boolean")
      chips.push(targetProfile.night_owl ? "Night owl" : "Early bird");
    if (targetProfile.lifestyle_smoking)
      chips.push(`Smoking: ${targetProfile.lifestyle_smoking}`);
    if (targetProfile.lifestyle_drinking)
      chips.push(`Drinking: ${targetProfile.lifestyle_drinking}`);
    if (targetProfile.lifestyle_pets)
      chips.push(`Pets: ${targetProfile.lifestyle_pets}`);
    if (targetProfile.lifestyle_kids)
      chips.push(`Kids: ${targetProfile.lifestyle_kids}`);
    if (targetProfile.lifestyle_fitness)
      chips.push(`Fitness: ${targetProfile.lifestyle_fitness}`);
    if (targetProfile.lifestyle_food)
      chips.push(`Food: ${targetProfile.lifestyle_food}`);
    if (targetProfile.lifestyle_religion)
      chips.push(`Religion: ${targetProfile.lifestyle_religion}`);

    return chips;
  }, [targetProfile]);

  // ────────────────────────────────────────────────
  // UI
  // ────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
        <ProfileViewHeader onBack={onBack} mode="romance" onPlannerPress={() => promptConnectBeforeInvite("romance")} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={Colors.primaryViolet} />
        </View>
      </View>
    );
  }

  if (!targetProfile) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
        <ProfileViewHeader onBack={onBack} mode="romance" onPlannerPress={() => promptConnectBeforeInvite("romance")} />
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
        <Text style={{ ...Typography.body, color: Colors.gray700 }}>
          This profile is not available.
        </Text>
        <TouchableOpacity
          onPress={onBack}
          style={{
            marginTop: 16,
            paddingVertical: 10,
            paddingHorizontal: 20,
            borderRadius: Layout.radii.control,
            borderWidth: 1,
            borderColor: Colors.primaryViolet,
          }}
        >
          <Text
            style={{
              ...Typography.body,
              color: Colors.primaryViolet,
              fontWeight: "600",
            }}
          >
            Go back
          </Text>
        </TouchableOpacity>
        </View>
      </View>
    );
  }

  const fullName =
    targetProfile.last_name && targetProfile.last_name.trim().length > 0
      ? `${targetProfile.first_name} ${targetProfile.last_name}`
      : targetProfile.first_name;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
      <ProfileViewHeader
        onBack={onBack}
        mode="romance"
        onPlannerPress={handlePlannerPress}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <ProfilePhotoGallery photos={photos} />

        {/* TEXT BLOCK */}
        <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
          {/* Name + Age + City */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text
                style={{
                  ...Typography.h1,
                  fontSize: 26,
                  color: Colors.textPrimary,
                }}
                numberOfLines={1}
              >
                {fullName}
                {targetProfile.age ? `, ${targetProfile.age}` : ""}
              </Text>
              <Text
                style={{
                  ...Typography.body,
                  color: Colors.gray700,
                }}
                numberOfLines={1}
              >
                {targetProfile.city?.trim()
                  ? normalizeLocationDisplayString(targetProfile.city, i18n?.language ?? "en")
                  : "Somewhere nearby"}
              </Text>
              {targetProfile.occupation && (
                <Text
                  style={{
                    ...Typography.caption,
                    color: Colors.gray600,
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  {targetProfile.occupation}
                </Text>
              )}
            </View>

            {/* AI Compatibility Badge */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                minWidth: 78,
                height: 40,
                borderRadius: 20,
                backgroundColor: Colors.accentMint,
                justifyContent: "center",
                paddingHorizontal: 10,
              }}
            >
              <SparklesIcon size={14} color="#003329" />
              <Text
                style={{
                  ...Typography.caption,
                  fontWeight: "700",
                  color: "#003329",
                }}
              >
                {ai.score}% match
              </Text>
            </View>
          </View>

          {/* AI Tags */}
          {ai.tags.length > 0 && (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                marginBottom: 10,
              }}
            >
              {ai.tags.slice(0, 4).map((tag) => (
                <View
                  key={tag}
                  style={{
                    borderRadius: 999,
                    backgroundColor: Colors.gray100,
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    marginRight: 6,
                    marginBottom: 6,
                  }}
                >
                  <Text
                    style={{
                      ...Typography.caption,
                      color: Colors.gray700,
                    }}
                  >
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <ProfileGeneralBlock
            coreBio={coreFields?.bio}
            education={targetProfile.education ?? coreFields?.education}
            languages={(targetProfile.languages ?? []).filter(Boolean) as string[]}
            activityPreferences={coreFields?.activity_preferences}
            nightOwl={targetProfile.night_owl}
          />

          <ProfileSection title="Romance">
            {targetProfile.bio_romance ? (
              <Text style={{ ...Typography.body, color: Colors.gray800, lineHeight: 22 }}>
                {targetProfile.bio_romance}
              </Text>
            ) : (
              <Text style={{ ...Typography.caption, color: Colors.gray500 }}>
                No romance bio yet.
              </Text>
            )}
          </ProfileSection>

          {romanceInterests.length > 0 ? (
            <ProfileSection title="Interests">
              <ProfileChipList items={romanceInterests} />
            </ProfileSection>
          ) : null}

          {relationshipGoals.length > 0 ? (
            <ProfileSection title="Dating goals">
              <ProfileChipList items={relationshipGoals} />
            </ProfileSection>
          ) : null}

          {targetProfile.instagram?.trim() ? (
            <ProfileInstagramLink handle={targetProfile.instagram} />
          ) : null}

          {/* Lifestyle */}
          {lifestyleChips.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  ...Typography.h3,
                  color: Colors.textPrimary,
                  marginBottom: 4,
                }}
              >
                Lifestyle
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {lifestyleChips.map((chip) => (
                  <View
                    key={chip}
                    style={{
                      borderRadius: 999,
                      backgroundColor: Colors.gray100,
                      paddingVertical: 4,
                      paddingHorizontal: 8,
                      marginRight: 6,
                      marginBottom: 6,
                    }}
                  >
                    <Text
                      style={{
                        ...Typography.caption,
                        color: Colors.textPrimary,
                      }}
                    >
                      {chip}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {isConnected ? (
            <ProfileConnectionActions
              mode="romance"
              primaryColor={Colors.romance.primary}
              busy={actionBusy}
              hasChat={!!chatId}
              onChat={() => void handleChat()}
              onRemove={handleRemoveConnection}
            />
          ) : (
            <ProfileSwipeActions
              mode="romance"
              primaryColor={Colors.romance.primary}
              disabled={actionBusy}
              onPass={() => void handlePass()}
              onSuper={() => void handleSuperLike()}
              onLike={() => void handleLike()}
            />
          )}
        </View>
      </ScrollView>

      <InviteToPlanModal
        visible={inviteVisible}
        mode="romance"
        partnerUserId={targetProfile.id}
        partnerDisplayName={fullName}
        onClose={() => setInviteVisible(false)}
        onSubmit={handleInviteSubmit}
      />
    </View>
  );
}
