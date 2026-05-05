// ────────────────────────────────────────────────
// Winkly Friends Mode – Home Screen (v7.0+)
// Same logic/functionality/view as Romance Home; Friends mode colors & sub-profile data
// ────────────────────────────────────────────────

import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  Animated,
  PanResponder,
  Alert,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { ModeHeader } from "@/components/layout/ModeHeader";
import { FriendsBottomNav } from "@/components/layout/FriendsBottomNav";
import { MatchCardOverlay } from "@/components/matching/MatchCardOverlay";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import { buildFriendsMatchTags, computeFriendsCompatibility, type FriendsProfile } from "@/lib/ai/friendsInsights";
import { hasAnyAIAccess } from "@/lib/ai/aiFeatureGate";
import { useModeContext } from "@/providers/ModeContextProvider";
import {
  blockUser,
  countIncomingFriendsRequests,
  recordSwipe,
  reportUser,
  sendFriendsRequest,
} from "@/lib/matching/actions";
import { fetchFriendsSwipeDeckProfiles } from "@/lib/discover/friendsSwipeDeck";
import { friendsFollowProfile } from "@/lib/access/connections";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH * 0.9;
const CARD_HEIGHT = Math.min(SCREEN_WIDTH * 0.9 * (4 / 3), SCREEN_HEIGHT * 0.52);
const SWIPE_THRESHOLD = 80;
const ACTION_BUTTON_SIZE = 64;
const ACTION_ICON_SIZE = 35;
const CARD_RADIUS = 24;
const STACK_OFFSET = 8;
const STACK_SCALE = 0.96;
const SUPER_LIKE_PER_DAY = 10;

type Profile = {
  id: string;
  user_id?: string | null;
  display_name: string;
  age?: number | null;
  city: string;
  occupation?: string | null;
  chipItems: string[];
  photoUrl: string;
  about?: string;
};

export default function FriendsHome() {
  const router = useRouter();
  const { context } = useModeContext();
  const showAiHints = hasAnyAIAccess(context.subscription_tier ?? "free");

  const [deckLoading, setDeckLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [selfProfile, setSelfProfile] = useState<FriendsProfile | null>(null);
  const [superLikeRemainingToday, setSuperLikeRemainingToday] = useState(SUPER_LIKE_PER_DAY);
  const [incomingRequestCount, setIncomingRequestCount] = useState(0);

  const cardAnim = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const refreshIncomingRequestCount = useCallback(async () => {
    try {
      const n = await countIncomingFriendsRequests();
      setIncomingRequestCount(n);
    } catch {
      setIncomingRequestCount(0);
    }
  }, []);

  const loadDeck = useCallback(async () => {
    setDeckLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) {
        setProfiles([]);
        setSelfProfile(null);
        return;
      }

      const { data: me } = await supabase
        .from("profiles_mode")
        .select("interests, meta")
        .eq("user_id", uid)
        .eq("mode", "friends")
        .maybeSingle();

      let selfForDeck: FriendsProfile | null = null;
      if (me) {
        selfForDeck = {
          id: uid,
          interests: (me.interests as string[]) ?? [],
          vibe_tags: (me.meta as { vibe_tags?: string[] })?.vibe_tags,
          city: (me.meta as { city?: string })?.city,
        };
        setSelfProfile(selfForDeck);
      } else {
        setSelfProfile(null);
      }

      const deck = await fetchFriendsSwipeDeckProfiles(uid, selfForDeck);
      const mapped: Profile[] = deck.map((row) => ({
        id: row.user_id,
        user_id: row.user_id,
        display_name: row.display_name,
        age: row.age ?? null,
        city: row.city || "City",
        occupation: row.occupation ?? null,
        chipItems: row.chipItems,
        photoUrl: row.photoUrl,
        about: row.about ?? undefined,
      }));
      setProfiles(mapped);
      setCurrentIndex(0);
      cardAnim.setValue({ x: 0, y: 0 });
    } catch (e) {
      console.warn("Friends deck load failed", e);
      setProfiles([]);
    } finally {
      setDeckLoading(false);
    }
  }, [cardAnim]);

  useFocusEffect(
    useCallback(() => {
      void loadDeck();
      void refreshIncomingRequestCount();
    }, [loadDeck, refreshIncomingRequestCount]),
  );

  const currentProfile = profiles[currentIndex];

  const advanceToNext = () => {
    setCurrentIndex((i) => i + 1);
    setTransitioning(false);
    cardAnim.setValue({ x: 0, y: 0 });
  };

  const applyPass = async (profileId: string) => {
    try {
      await recordSwipe({ mode: "friends", targetUserId: profileId, action: "pass" });
    } catch (e) {
      console.warn("Pass failed", e);
    }
  };

  const applyAddFriend = async (profileId: string) => {
    try {
      const res = await friendsFollowProfile(profileId);
      if (res.is_connection && res.chat_id) {
        router.push(`/chats/${res.chat_id}`);
      }
    } catch (e) {
      console.warn("Follow failed", e);
    }
  };

  const applySuperConnect = async (profileId: string) => {
    try {
      setSuperLikeRemainingToday((n) => Math.max(0, n - 1));
      await sendFriendsRequest({ targetUserId: profileId, kind: "super_connect" });
    } catch (e) {
      console.warn("Super connect failed", e);
    }
  };

  const applyBlock = async (profileId: string, reason: string) => {
    try {
      await blockUser({ targetUserId: profileId, reason });
    } catch (e) {
      console.warn("Block failed", e);
    }
  };

  const applyReport = async (profileId: string, reason: string) => {
    try {
      const mapped =
        reason === "Inappropriate content"
          ? "inappropriate"
          : reason === "Fake profile"
            ? "fake_profile"
            : reason === "Harassment"
              ? "harassment"
              : reason === "Spam"
                ? "spam"
                : "other";
      await reportUser({ targetUserId: profileId, reason: mapped });
      await blockUser({ targetUserId: profileId, reason: "Reported: " + reason });
    } catch (e) {
      console.warn("Report failed", e);
    }
  };

  const BLOCK_REASONS = ["Not what I'm looking for", "Card is repeating", "Other"] as const;
  const REPORT_REASONS = ["Inappropriate content", "Fake profile", "Harassment", "Spam", "Other"] as const;

  const showBlockReportMenu = () => {
    if (!currentProfile) return;
    const profileId = currentProfile.id;
    Haptics.selectionAsync();
    Alert.alert(
      "Block or report",
      "Choose an action for this profile.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          onPress: () => {
            Alert.alert(
              "Why do you want to block?",
              "This profile will be removed from your suggestions.",
              [
                { text: "Cancel", style: "cancel" },
                ...BLOCK_REASONS.map((reason) => ({
                  text: reason,
                  onPress: () => {
                    applyBlock(profileId, reason);
                    animateCardOut("left", "pass");
                  },
                })),
              ]
            );
          },
        },
        {
          text: "Report",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Why are you reporting?",
              "Winkly admins will be notified.",
              [
                { text: "Cancel", style: "cancel" },
                ...REPORT_REASONS.map((reason) => ({
                  text: reason,
                  onPress: () => {
                    applyReport(profileId, reason);
                    animateCardOut("left", "pass");
                  },
                })),
              ]
            );
          },
        },
      ]
    );
  };

  const handleCardPress = () => {
    if (currentProfile) {
      router.push(`/(modes)/friends/profile-view?user_id=${currentProfile.user_id ?? currentProfile.id}`);
    }
  };

  type SwipeAction = "pass" | "addFriend" | "superConnect";

  const animateCardOut = (direction: "left" | "right" | "up" | "down", action?: SwipeAction) => {
    if (transitioning) return;
    const profileId = currentProfile?.id;
    setTransitioning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const toValue =
      direction === "left"
        ? { x: -SCREEN_WIDTH, y: 0 }
        : direction === "right"
          ? { x: SCREEN_WIDTH, y: 0 }
          : direction === "up"
            ? { x: 0, y: -SCREEN_HEIGHT }
            : { x: 0, y: SCREEN_HEIGHT };

    Animated.timing(cardAnim, {
      toValue,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      if (profileId && action === "pass") applyPass(profileId);
      if (profileId && action === "addFriend") applyAddFriend(profileId);
      if (profileId && action === "superConnect") applySuperConnect(profileId);
      advanceToNext();
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => false,
      onPanResponderRelease: (_, gestureState) => {
        const { dx, dy } = gestureState;
        const isTap = Math.abs(dx) < 20 && Math.abs(dy) < 20;
        if (isTap) {
          handleCardPress();
          Animated.spring(cardAnim, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
            tension: 80,
            friction: 10,
          }).start();
          return;
        }
        if (Math.abs(dx) > SWIPE_THRESHOLD) {
          // Swipe right = Add friend, swipe left = Pass
          animateCardOut(dx > 0 ? "right" : "left", dx > 0 ? "addFriend" : "pass");
        } else if (dy > SWIPE_THRESHOLD) {
          handleCardPress();
          Animated.spring(cardAnim, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
            tension: 80,
            friction: 10,
          }).start();
        } else if (dy < -SWIPE_THRESHOLD) {
          animateCardOut("up");
        } else {
          Animated.spring(cardAnim, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
            tension: 80,
            friction: 10,
          }).start();
        }
      },
      onPanResponderMove: (_, gestureState) => {
        cardAnim.setValue({ x: gestureState.dx, y: gestureState.dy });
      },
    })
  ).current;

  const otherForInsights: FriendsProfile = currentProfile
    ? {
        id: currentProfile.id,
        display_name: currentProfile.display_name,
        city: currentProfile.city,
        interests: currentProfile.chipItems,
        vibe_tags: currentProfile.chipItems,
      }
    : ({} as FriendsProfile);
  const chipItems =
    currentProfile?.chipItems?.length > 0
      ? currentProfile.chipItems
      : buildFriendsMatchTags({ self: selfProfile, other: otherForInsights }).slice(0, 3);

  const friendsAiHint = React.useMemo(() => {
    if (!showAiHints || !selfProfile || !currentProfile) return null;
    const other: FriendsProfile = {
      id: currentProfile.id,
      display_name: currentProfile.display_name,
      city: currentProfile.city,
      interests: currentProfile.chipItems,
      vibe_tags: currentProfile.chipItems,
    };
    const score = computeFriendsCompatibility({ self: selfProfile, other });
    const tags = buildFriendsMatchTags({ self: selfProfile, other });
    return { score, tags };
  }, [showAiHints, selfProfile, currentProfile]);

  return (
    <View style={styles.container}>
      <ModeHeader
        currentMode="friends"
        leftSlot="filters"
        onFilterPress={() => router.push("/(modes)/friends/filters")}
      />

      {incomingRequestCount > 0 ? (
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            router.push("/(modes)/friends/friend-requests");
          }}
          style={styles.requestsBanner}
          accessibilityLabel="Open connection requests"
        >
          <Ionicons name="people" size={22} color={Colors.friends.primary} />
          <Text style={styles.requestsBannerText}>
            {incomingRequestCount} connection request{incomingRequestCount === 1 ? "" : "s"}
          </Text>
          <Ionicons name="chevron-forward" size={20} color={Colors.friends.primary} />
        </Pressable>
      ) : null}

      {deckLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.friends.primary} />
        </View>
      ) : !currentProfile ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>You&apos;ve seen everyone nearby 👋</Text>
          <Pressable
            onPress={() => router.push("/(modes)/friends/filters")}
            style={styles.adjustFiltersBtn}
            accessibilityLabel="Adjust filters"
          >
            <Text style={styles.adjustFiltersText}>Adjust filters</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.cardContainer}>
            <View style={[styles.cardStackWrap, { width: CARD_WIDTH, height: CARD_HEIGHT + STACK_OFFSET + 4 }]}>
              {profiles[currentIndex + 1] && (
                <View
                  style={[
                    styles.card,
                    styles.stackCard,
                    {
                      width: CARD_WIDTH,
                      height: CARD_HEIGHT,
                      borderRadius: CARD_RADIUS,
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      transform: [{ scale: STACK_SCALE }, { translateY: STACK_OFFSET }],
                    },
                  ]}
                  pointerEvents="none"
                >
                  <Image
                    source={{ uri: profiles[currentIndex + 1].photoUrl }}
                    style={[styles.cardImage, { borderTopLeftRadius: CARD_RADIUS, borderTopRightRadius: CARD_RADIUS }]}
                    resizeMode="cover"
                  />
                </View>
              )}

              <View style={[styles.cardWrapper, { width: CARD_WIDTH, height: CARD_HEIGHT }]}>
                <Animated.View
                  {...panResponder.panHandlers}
                  style={[
                    styles.card,
                    {
                      width: CARD_WIDTH,
                      height: CARD_HEIGHT,
                      borderRadius: CARD_RADIUS,
                      transform: [{ translateX: cardAnim.x }, { translateY: cardAnim.y }],
                    },
                  ]}
                >
                  <View style={styles.mediaArea}>
                    <Image
                      source={{ uri: currentProfile.photoUrl }}
                      style={[styles.cardImage, { borderTopLeftRadius: CARD_RADIUS, borderTopRightRadius: CARD_RADIUS }]}
                      resizeMode="cover"
                    />
                  </View>

                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      showBlockReportMenu();
                    }}
                    style={styles.cardMenuBtn}
                    accessibilityLabel="Block or report"
                  >
                    <Ionicons name="ellipsis-vertical" size={22} color={Colors.friends.primary} />
                  </Pressable>

                  <MatchCardOverlay
                    name={currentProfile.display_name}
                    age={currentProfile.age}
                    city={currentProfile.city}
                    occupation={currentProfile.occupation ?? null}
                    chipItems={chipItems}
                    mode="friends"
                    aiHint={friendsAiHint}
                    cardRadius={CARD_RADIUS}
                  />
                </Animated.View>
              </View>
            </View>
          </View>

          <View style={styles.actionBarContainer}>
            <View style={styles.actionRow}>
              <View style={styles.actionButtonColumn}>
                <Pressable
                  onPress={() => currentProfile && animateCardOut("left", "pass")}
                  disabled={transitioning}
                  style={({ pressed }) => [styles.actionIconWrap, styles.actionIconGlowPass, pressed && styles.actionBtnPressed]}
                  accessibilityLabel="Pass"
                >
                  <Ionicons name="close" size={ACTION_ICON_SIZE} color={Colors.friends.primary} />
                </Pressable>
              </View>

              <View style={styles.actionButtonColumn}>
                <Pressable
                  onPress={() => {
                    if (currentProfile) {
                      if (superLikeRemainingToday <= 0) return;
                      animateCardOut("right", "superConnect");
                    }
                  }}
                  disabled={transitioning || superLikeRemainingToday <= 0}
                  style={({ pressed }) => [
                    styles.actionIconWrap,
                    styles.actionIconGlowIntent,
                    (superLikeRemainingToday <= 0 || transitioning) && styles.actionBtnDisabled,
                    pressed && styles.actionBtnPressed,
                  ]}
                  accessibilityLabel="Super Connect"
                >
                  <Ionicons name="star" size={ACTION_ICON_SIZE} color="#E6B800" />
                </Pressable>
              </View>

              <View style={styles.actionButtonColumn}>
                <Pressable
                  onPress={() => currentProfile && animateCardOut("right", "addFriend")}
                  disabled={transitioning}
                  style={({ pressed }) => [styles.actionIconWrap, styles.actionIconGlowLike, pressed && styles.actionBtnPressed]}
                  accessibilityLabel="Add friend"
                >
                  <Ionicons name="heart" size={ACTION_ICON_SIZE} color={Colors.friends.primary} />
                </Pressable>
              </View>
            </View>
            <View style={styles.actionBarSubtitle}>
              <Text style={styles.subtitleLine1}>
                {superLikeRemainingToday <= 0
                  ? "You have no Super likes left today."
                  : `You have ${superLikeRemainingToday} Super like${superLikeRemainingToday === 1 ? "" : "s"} left today.`}
              </Text>
            </View>
          </View>
        </>
      )}

      <FriendsBottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  requestsBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.friends.primary,
  },
  requestsBannerText: {
    flex: 1,
    ...Typography.button,
    fontFamily: FontFamily.heading,
    color: Colors.textPrimary,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundMuted,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyTitle: {
    ...Typography.h3,
    fontFamily: FontFamily.heading,
    color: Colors.textPrimary,
    textAlign: "center",
    marginBottom: 24,
  },
  adjustFiltersBtn: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: Colors.friends.primary,
    minHeight: 48,
    justifyContent: "center",
  },
  adjustFiltersText: {
    ...Typography.button,
    fontFamily: FontFamily.heading,
    color: Colors.friends.primary,
  },
  cardContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: Layout.spacing.sm,
    paddingBottom: 2,
    minHeight: 0,
  },
  cardStackWrap: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  cardWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: Colors.white,
    overflow: "hidden",
    ...Shadow.card,
    shadowRadius: 20,
    shadowOpacity: 0.12,
    elevation: 8,
  },
  stackCard: {
    position: "absolute",
    backgroundColor: Colors.gray100,
    opacity: 0.95,
  },
  mediaArea: {
    width: "100%",
    flex: 1,
    backgroundColor: Colors.gray200,
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  cardMenuBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  actionBarContainer: {
    alignItems: "center",
    width: "100%",
    paddingBottom: 28,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingTop: 2,
    paddingBottom: 4,
  },
  actionButtonColumn: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 40,
  },
  actionIconWrap: {
    width: ACTION_BUTTON_SIZE,
    height: ACTION_BUTTON_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconGlowPass: {
    shadowColor: Colors.friends.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.38,
    shadowRadius: 12,
    elevation: 4,
  },
  actionIconGlowIntent: {
    shadowColor: "#E6B800",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.42,
    shadowRadius: 12,
    elevation: 4,
  },
  actionIconGlowLike: {
    shadowColor: Colors.friends.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.38,
    shadowRadius: 12,
    elevation: 4,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnPressed: {
    transform: [{ scale: 0.92 }],
  },
  actionBarSubtitle: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 2,
    paddingBottom: 8,
  },
  subtitleLine1: {
    ...Typography.caption,
    fontSize: 11,
    color: Colors.gray600,
    marginTop: 0,
    textAlign: "center",
    width: "100%",
  },
});
