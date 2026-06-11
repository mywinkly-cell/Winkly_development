import React, { useState, useRef, useEffect, useCallback } from "react";
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
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { chatRoutes } from "@/lib/navigation/modeHub";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { ModeHeader } from "@/components/layout/ModeHeader";
import { RomanceBottomNav } from "@/components/layout/RomanceBottomNav";
import { MatchCardOverlay } from "@/components/matching/MatchCardOverlay";
import { MatchCelebration } from "@/components/matching/MatchCelebration";
import { SwipeDeckEmptyState } from "@/components/matching/SwipeDeckEmptyState";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";
import { HIT_SLOP } from "@/constants/a11y";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { useModeContext } from "@/providers/ModeContextProvider";
import { romanceLikeProfile } from "@/lib/chats";
import { computeCompatibilityScore, buildMatchTags, type RomanceProfile } from "@/lib/ai/romanceInsights";
import { hasAnyAIAccess } from "@/lib/ai/aiFeatureGate";
import { supabase } from "@/lib/supabase";
import { SuperLikeInviteModal } from "@/components/romance/SuperLikeInviteModal";
import { blockUser, recordSwipe, reportUser } from "@/lib/matching/actions";
import { buildRomanceSuperLikeIcebreaker } from "@/lib/matching/romanceIcebreaker";
import { fetchRomanceSwipeDeckProfiles } from "@/lib/discover/romanceSwipeDeck";
import { keyboardAvoidingProps } from "@/lib/ui/keyboardAvoiding";
import { fetchRomanceLikesReceivedCount } from "@/lib/discover/likesReceivedCount";
import { updateMyLocationOnAppOpen } from "@/lib/location/updateLocation";
import {
  acceptRomanceChatInvite,
  declineRomanceChatInvite,
  fetchRomancePendingChatInvites,
  formatRomanceInviteName,
} from "@/lib/romance/chatInvites";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH * 0.9;
const CARD_HEIGHT = Math.min(SCREEN_WIDTH * 0.9 * (4 / 3), SCREEN_HEIGHT * 0.52);
const SWIPE_THRESHOLD = 80;
const ACTION_BUTTON_SIZE = 64; // 10% bigger than 58
const ACTION_ICON_SIZE = 35;  // 10% bigger than 32
const CARD_RADIUS = Layout.radii.card;
const INTENT_FREE_PER_DAY = 1;
const INTENT_SUBSCRIBER_PER_DAY = 10;
const STACK_OFFSET = 8;
const STACK_SCALE = 0.96;

type Profile = {
  id: string;
  name: string;
  age: number;
  city: string;
  occupation?: string | null;
  /** First 3 shown: interests + relationship goals combined */
  chipItems: string[];
  /** Subset of chipItems shared with the viewer — highlighted on the card. */
  highlightChips?: string[];
  photoUrl: string;
  /** Rounded, privacy-safe distance label from the server (e.g. "~3 km away"). */
  distanceLabel?: string | null;
  /** Pre-match chat invite — shown first on Home with envelope badge. */
  isPendingInvite?: boolean;
  conversationId?: string;
  invitePreviewMessage?: string | null;
};

type MatchState = {
  visible: boolean;
  otherName: string;
  otherPhotoUrl: string | null;
  chatId: string | null;
};

export default function RomanceHome() {
  const router = useRouter();
  const { context } = useModeContext();
  const hasIntentSubscription = context.subscription_tier === "premium";
  const showAiHints = hasAnyAIAccess(context.subscription_tier ?? "free");

  const [deckLoading, setDeckLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [selfProfile, setSelfProfile] = useState<RomanceProfile | null>(null);
  const [selfPhotoUrl, setSelfPhotoUrl] = useState<string | null>(null);
  const [matchState, setMatchState] = useState<MatchState>({
    visible: false,
    otherName: "",
    otherPhotoUrl: null,
    chatId: null,
  });
  // Intent (Super Like): daily limit — 1 free/day; 10/day with subscription (Premium)
  const [intentRemainingToday, setIntentRemainingToday] = useState(
    hasIntentSubscription ? INTENT_SUBSCRIBER_PER_DAY : INTENT_FREE_PER_DAY
  );
  const [intentModalVisible, setIntentModalVisible] = useState(false);
  const [superLikeInviteModalVisible, setSuperLikeInviteModalVisible] = useState(false);
  const [intentMessage, setIntentMessage] = useState("");
  const [likesReceivedCount, setLikesReceivedCount] = useState<number | null>(null);

  const cardAnim = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const pendingIntentMessage = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (context.subscription_tier === "premium") {
      setIntentRemainingToday(INTENT_SUBSCRIBER_PER_DAY);
    }
  }, [context.subscription_tier]);

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

      // Self photo for the "It's a match!" celebration.
      const { data: selfRow } = await supabase
        .from("public_profile_view")
        .select("main_photo_url, romance_photos, core_photos")
        .eq("id", uid)
        .maybeSingle();
      if (selfRow) {
        const r = selfRow as Record<string, unknown>;
        const photo =
          (r.romance_photos as (string | null)[] | null)?.find((p) => !!p) ??
          (r.core_photos as (string | null)[] | null)?.find((p) => !!p) ??
          (r.main_photo_url as string | null) ??
          null;
        setSelfPhotoUrl(photo ?? null);
      }

      let selfForDeck: RomanceProfile | null = null;
      if (showAiHints) {
        const { data } = await supabase
          .from("public_profile_view")
          .select("id,first_name,age,city,romance_interests,languages,occupation,bio_romance")
          .eq("id", uid)
          .maybeSingle();
        if (data) {
          const row = data as Record<string, unknown>;
          selfForDeck = {
            id: row.id as string,
            first_name: row.first_name as string,
            age: (row.age as number | undefined) ?? undefined,
            city: (row.city as string | undefined) ?? undefined,
            interests: (row.romance_interests as string[]) ?? [],
            languages: (row.languages as string[]) ?? [],
            occupation: (row.occupation as string | undefined) ?? undefined,
            bio_romance: (row.bio_romance as string | undefined) ?? undefined,
          };
          setSelfProfile(selfForDeck);
        }
      } else {
        setSelfProfile(null);
      }

      const [pendingInvites, deck] = await Promise.all([
        fetchRomancePendingChatInvites(uid).catch(() => []),
        fetchRomanceSwipeDeckProfiles(uid, selfForDeck),
      ]);
      const pendingProfiles: Profile[] = pendingInvites.map((inv) => {
        const photos = inv.romance_photos.length ? inv.romance_photos : inv.core_photos;
        return {
          id: inv.id,
          name: formatRomanceInviteName(inv),
          age: inv.age ?? 0,
          city: inv.city ?? "",
          occupation: inv.occupation,
          chipItems: inv.super_like ? ["Super like", "New message"] : ["New message"],
          photoUrl: photos[0] ?? "",
          isPendingInvite: true,
          conversationId: inv.conversation_id,
          invitePreviewMessage: inv.preview_message,
        };
      });
      const pendingIds = new Set(pendingProfiles.map((p) => p.id));
      setProfiles([...pendingProfiles, ...deck.filter((p) => !pendingIds.has(p.id))]);
      setCurrentIndex(0);
      cardAnim.setValue({ x: 0, y: 0 });
    } catch (e) {
      console.warn("Romance deck load failed", e);
      setProfiles([]);
    } finally {
      setDeckLoading(false);
    }
  }, [showAiHints, cardAnim]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      // Refresh coarse location on open (throttled, permission-gated), then load
      // the deck so distance filtering reflects the latest position.
      (async () => {
        const res = await updateMyLocationOnAppOpen();
        if (!active) return;
        await loadDeck();
        // If we just got a fresh fix, reload once more so distances populate.
        if (res.ok) {
          if (!active) return;
          await loadDeck();
        }
      })();
      return () => {
        active = false;
      };
    }, [loadDeck]),
  );

  const currentProfile = profiles[currentIndex];

  useEffect(() => {
    if (deckLoading || currentProfile) return;
    let active = true;
    setLikesReceivedCount(null);
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id;
        if (!uid || !active) return;
        const count = await fetchRomanceLikesReceivedCount(uid);
        if (active) setLikesReceivedCount(count);
      } catch {
        if (active) setLikesReceivedCount(0);
      }
    })();
    return () => {
      active = false;
    };
  }, [deckLoading, currentProfile]);

  const intentAiIcebreaker = React.useMemo(
    () =>
      buildRomanceSuperLikeIcebreaker(
        selfProfile
          ? { interests: selfProfile.interests, city: selfProfile.city }
          : null,
        currentProfile
          ? {
              name: currentProfile.name,
              chipItems: currentProfile.chipItems,
              city: currentProfile.city,
            }
          : null,
      ),
    [selfProfile, currentProfile],
  );

  const romanceAiHint = React.useMemo(() => {
    if (!showAiHints || !selfProfile || !currentProfile) return null;
    const other: RomanceProfile = {
      id: currentProfile.id,
      first_name: currentProfile.name,
      age: currentProfile.age,
      city: currentProfile.city,
      interests: currentProfile.chipItems,
      occupation: currentProfile.occupation ?? undefined,
    };
    const score = computeCompatibilityScore({ self: selfProfile, other });
    const tags = buildMatchTags({ self: selfProfile, other });
    return { score, tags };
  }, [showAiHints, selfProfile, currentProfile]);

  const advanceToNext = () => {
    setCurrentIndex((i) => i + 1);
    setTransitioning(false);
    cardAnim.setValue({ x: 0, y: 0 });
  };

  /** Store preference and optionally re-insert profile (max 2 passes). Backend will handle ranking. */
  const applyPass = async (profileId: string) => {
    try {
      await recordSwipe({ mode: "romance", targetUserId: profileId, action: "pass" });
    } catch (e) {
      console.warn("Pass failed", e);
    }
  };

  const celebrateMatch = (profile: Profile | undefined, chatId: string | null) => {
    if (!profile) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMatchState({
      visible: true,
      otherName: profile.name,
      otherPhotoUrl: profile.photoUrl ?? null,
      chatId: chatId ?? null,
    });
  };

  const applyLike = async (profileId: string, profile?: Profile) => {
    try {
      const result = await romanceLikeProfile(profileId);
      if (result?.is_match) {
        celebrateMatch(profile, result?.chat_id ?? null);
      }
    } catch (e) {
      console.warn("Like failed", e);
    }
  };

  const applyIntent = async (profileId: string, message?: string, profile?: Profile) => {
    setIntentRemainingToday((n) => Math.max(0, n - 1));
    pendingIntentMessage.current = undefined;
    try {
      const result = await romanceLikeProfile(profileId, {
        superLike: true,
        superLikeMessage: message || null,
      });
      if (result?.is_match) {
        celebrateMatch(profile, result?.chat_id ?? null);
      }
    } catch (e) {
      console.warn("Super like failed", e);
    }
  };

  /** Block: remove from suggestions permanently for this user. */
  const applyBlock = async (profileId: string, reason: string) => {
    try {
      await blockUser({ targetUserId: profileId, reason });
    } catch (e) {
      console.warn("Block failed", e);
    }
  };

  /** Report: same as block + notify Winkly admins with reason. */
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

  const BLOCK_REASONS = [
    "Not what I'm looking for",
    "Card is repeating",
    "Other",
  ] as const;
  const REPORT_REASONS = [
    "Inappropriate content",
    "Fake profile",
    "Harassment",
    "Spam",
    "Other",
  ] as const;

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
              "This profile will be removed from your suggestions and won't appear again.",
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
              "This profile will be removed from your suggestions. Winkly admins will be notified and may take action.",
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
    if (!currentProfile) return;
    router.push(`/(modes)/romance/profile-view?id=${currentProfile.id}&source=home`);
  };

  type SwipeAction = "pass" | "like" | "intent";

  const animateCardOut = (direction: "left" | "right" | "up" | "down", action?: SwipeAction) => {
    if (transitioning) return;
    const swipedProfile = currentProfile;
    const profileId = swipedProfile?.id;
    setTransitioning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

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
    }).start(async () => {
      if (swipedProfile?.isPendingInvite && swipedProfile.conversationId) {
        try {
          if (action === "like") {
            const res = await acceptRomanceChatInvite(swipedProfile.conversationId);
            if (res.ok) {
              celebrateMatch(swipedProfile, res.chat_id ?? swipedProfile.conversationId);
            }
          } else if (action === "pass") {
            await declineRomanceChatInvite(swipedProfile.conversationId);
          }
        } catch (e) {
          console.warn("Pending invite action failed", e);
        }
        advanceToNext();
        return;
      }
      if (profileId && action === "pass") applyPass(profileId);
      if (profileId && action === "like") await applyLike(profileId, swipedProfile);
      if (profileId && action === "intent")
        await applyIntent(profileId, pendingIntentMessage.current, swipedProfile);
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
          // Swipe right = Like, swipe left = Pass
          animateCardOut(dx > 0 ? "right" : "left", dx > 0 ? "like" : "pass");
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

  const handlePass = () => {
    if (currentProfile) {
      animateCardOut("left", "pass");
    }
  };

  const handleLike = () => {
    if (currentProfile) {
      animateCardOut("right", "like");
    }
  };

  const handleIntentPress = () => {
    if (!currentProfile) return;
    if (intentRemainingToday <= 0) {
      Alert.alert(
        "No Super Likes left",
        "You've used your free Super Like for today. Get more with a subscription?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "View plans", onPress: () => router.push("/account") },
        ]
      );
      return;
    }
    setIntentMessage("");
    setIntentModalVisible(true);
  };

  const sendIntent = (message?: string) => {
    if (!currentProfile) return;
    setIntentModalVisible(false);
    pendingIntentMessage.current = message;
    animateCardOut("right", "intent");
  };

  return (
    <View style={styles.container}>
      <ModeHeader
        currentMode="romance"
        leftSlot="profile"
        profilePhotoUrl={selfPhotoUrl}
        profileInitials={selfProfile?.first_name?.slice(0, 1) ?? "?"}
        onProfilePress={() => router.push("/profile/view-profile")}
        rightSlot="filters"
        onFilterPress={() => router.push("/(modes)/romance/filters")}
      />

      {deckLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.romance.primary} />
        </View>
      ) : !currentProfile ? (
        <SwipeDeckEmptyState
          mode="romance"
          likesCount={likesReceivedCount}
          onExpandRadius={() => router.push("/(modes)/romance/filters")}
          onOpenDiscover={() => router.push("/(modes)/romance/discover")}
        />
      ) : (
        <>
          <View style={styles.cardContainer}>
            <View style={[styles.cardStackWrap, { width: CARD_WIDTH, height: CARD_HEIGHT + STACK_OFFSET + 4 }]}>
              {/* Stacked "next" card peek for depth */}
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
                      transform: [
                        { scale: STACK_SCALE },
                        { translateY: STACK_OFFSET },
                      ],
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
                    transform: [
                      { translateX: cardAnim.x },
                      { translateY: cardAnim.y },
                    ],
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
                  hitSlop={HIT_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel="Block or report"
                >
                  <Ionicons name="ellipsis-vertical" size={22} color={Colors.romance.primary} />
                </Pressable>

                <MatchCardOverlay
                  name={currentProfile.name}
                  age={currentProfile.age}
                  city={currentProfile.city}
                  occupation={currentProfile.occupation ?? null}
                  chipItems={currentProfile.chipItems}
                  highlightItems={currentProfile.highlightChips}
                  mode="romance"
                  aiHint={romanceAiHint}
                  distanceLabel={currentProfile.distanceLabel}
                  hasIncomingMessage={currentProfile.isPendingInvite}
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
                  onPress={handlePass}
                  disabled={transitioning}
                  style={({ pressed }) => [styles.actionIconWrap, styles.actionIconGlowPass, pressed && styles.actionBtnPressed]}
                  hitSlop={HIT_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel="Pass"
                  accessibilityState={{ disabled: transitioning }}
                >
                  <Ionicons name="close" size={ACTION_ICON_SIZE} color={Colors.romance.primary} />
                </Pressable>
              </View>

              <View style={styles.actionButtonColumn}>
                <Pressable
                  onPress={handleIntentPress}
                  disabled={transitioning || intentRemainingToday <= 0}
                  style={({ pressed }) => [
                    styles.actionIconWrap,
                    styles.actionIconGlowIntent,
                    (intentRemainingToday <= 0 || transitioning) && styles.actionBtnDisabled,
                    pressed && styles.actionBtnPressed,
                  ]}
                  hitSlop={HIT_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel="Super Like"
                  accessibilityState={{ disabled: transitioning || intentRemainingToday <= 0 }}
                >
                  <Ionicons name="star" size={ACTION_ICON_SIZE} color="#E6B800" />
                </Pressable>
              </View>

              <View style={styles.actionButtonColumn}>
                <Pressable
                  onPress={handleLike}
                  disabled={transitioning}
                  style={({ pressed }) => [styles.actionIconWrap, styles.actionIconGlowLike, pressed && styles.actionBtnPressed]}
                  hitSlop={HIT_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel="Like"
                  accessibilityState={{ disabled: transitioning }}
                >
                  <Ionicons name="heart" size={ACTION_ICON_SIZE} color={Colors.romance.primary} />
                </Pressable>
              </View>
            </View>
            <View style={styles.actionBarSubtitle}>
              <Text style={styles.intentSubtitleLine1}>
                {intentRemainingToday <= 0
                  ? "There are no Super Likes left for today."
                  : `You have ${intentRemainingToday} Super Like${intentRemainingToday === 1 ? "" : "s"} today.`}
              </Text>
              {!hasIntentSubscription && (
                <>
                  <Text style={styles.intentSubtitleLine2}>Choose a subscription to get more.</Text>
                  <Pressable
                    onPress={() => router.push("/account/subscription")}
                    style={styles.intentSubtitleLink}
                    accessibilityRole="button"
                    accessibilityLabel="Subscription plans"
                  >
                    <Text style={styles.intentSubtitleLinkText}>Subscription plans</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>

          <Modal
            visible={intentModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setIntentModalVisible(false)}
          >
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => setIntentModalVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Close Super Like message dialog"
            >
              <KeyboardAvoidingView {...keyboardAvoidingProps()} style={styles.modalContentWrap}>
                <Pressable
                  style={styles.intentModalCard}
                  onPress={(e) => e.stopPropagation()}
                  accessibilityRole="none"
                >
                  <Text style={styles.intentModalTitle}>Add a message? (optional)</Text>
                  <Text style={styles.intentModalHint}>
                    They&apos;ll see it when they see your profile. Start from a suggested opener or write your own.
                  </Text>
                  <Pressable
                    style={styles.icebreakerChip}
                    onPress={() => setIntentMessage(intentAiIcebreaker)}
                    accessibilityRole="button"
                    accessibilityLabel="Use suggested opener"
                  >
                    <SparklesIcon size={16} color={Colors.primaryViolet} />
                    <Text style={styles.icebreakerChipText}>Use suggested opener</Text>
                  </Pressable>
                  <TextInput
                    style={styles.intentMessageInput}
                    placeholder="Or write your own..."
                    placeholderTextColor={Colors.gray500}
                    value={intentMessage}
                    onChangeText={setIntentMessage}
                    multiline
                    maxLength={200}
                  />
                  <Pressable
                    style={styles.intentInviteChip}
                    onPress={() => {
                      setIntentModalVisible(false);
                      setSuperLikeInviteModalVisible(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Send Super Like with an invite"
                  >
                    <Ionicons name="calendar-outline" size={18} color={Colors.primaryViolet} />
                    <Text style={styles.intentInviteChipText}>Send with an invite (place & time)</Text>
                  </Pressable>
                  <View style={styles.intentModalActions}>
                    <Pressable
                      style={styles.intentModalBtnSecondary}
                      onPress={() => sendIntent()}
                      accessibilityRole="button"
                      accessibilityLabel="Skip message and send Super Like"
                    >
                      <Text style={styles.intentModalBtnSecondaryText}>Skip</Text>
                    </Pressable>
                    <Pressable
                      style={styles.intentModalBtnPrimary}
                      onPress={() => sendIntent(intentMessage.trim() || undefined)}
                      accessibilityRole="button"
                      accessibilityLabel="Send Super Like with message"
                    >
                      <Text style={styles.intentModalBtnPrimaryText}>Send</Text>
                    </Pressable>
                  </View>
                </Pressable>
              </KeyboardAvoidingView>
            </Pressable>
          </Modal>

          {currentProfile && (
            <SuperLikeInviteModal
              visible={superLikeInviteModalVisible}
              targetUserId={currentProfile.id}
              targetFirstName={currentProfile.name}
              onClose={() => setSuperLikeInviteModalVisible(false)}
              onSend={(message) => {
                setSuperLikeInviteModalVisible(false);
                setIntentRemainingToday((n) => Math.max(0, n - 1));
                pendingIntentMessage.current = message;
                animateCardOut("right", "intent");
              }}
            />
          )}
        </>
      )}

      <MatchCelebration
        visible={matchState.visible}
        selfPhotoUrl={selfPhotoUrl}
        otherPhotoUrl={matchState.otherPhotoUrl}
        otherName={matchState.otherName}
        onSendMessage={() => {
          const chatId = matchState.chatId;
          setMatchState((s) => ({ ...s, visible: false }));
          if (chatId) {
            router.push(
              chatRoutes.conversation("romance", chatId, { matchBridge: "1" }) as Parameters<
                typeof router.push
              >[0]
            );
          } else {
            router.push(chatRoutes.index("romance"));
          }
        }}
        onKeepSwiping={() => setMatchState((s) => ({ ...s, visible: false }))}
      />

      <RomanceBottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
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
    shadowColor: Colors.romance.primary,
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
    shadowColor: Colors.romance.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.38,
    shadowRadius: 12,
    elevation: 4,
  },
  actionBarSubtitle: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 2,
    paddingBottom: 8,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnPressed: {
    transform: [{ scale: 0.92 }],
  },
  intentSubtitleLine1: {
    ...Typography.caption,
    fontSize: 11,
    color: Colors.gray600,
    marginTop: 0,
    textAlign: "center",
    width: "100%",
  },
  intentSubtitleLine2: {
    ...Typography.caption,
    fontSize: 11,
    color: Colors.gray600,
    marginTop: 2,
    textAlign: "center",
    width: "100%",
  },
  intentSubtitleLink: {
    marginTop: 4,
  },
  intentSubtitleLinkText: {
    ...Typography.caption,
    fontSize: 12,
    fontWeight: "600",
    color: Colors.romance.primary,
    textAlign: "center",
    textDecorationLine: "underline",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContentWrap: {
    width: "100%",
    maxWidth: 360,
  },
  intentModalCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 24,
    ...Shadow.card,
  },
  intentModalTitle: {
    ...Typography.h3,
    fontFamily: FontFamily.headingBold,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  intentModalHint: {
    ...Typography.caption,
    color: Colors.gray600,
    marginBottom: 14,
  },
  icebreakerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.romance.secondary,
    borderWidth: 1,
    borderColor: "rgba(232,56,56,0.2)",
    marginBottom: 12,
  },
  icebreakerChipText: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.romance.primary,
  },
  intentInviteChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primaryViolet,
    backgroundColor: Colors.primaryViolet + "12",
  },
  intentInviteChipText: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.primaryViolet,
  },
  intentMessageInput: {
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 88,
    ...Typography.body,
    color: Colors.textPrimary,
    marginBottom: 20,
    textAlignVertical: "top",
  },
  intentModalActions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
  },
  intentModalBtnSecondary: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: Colors.gray100,
  },
  intentModalBtnSecondaryText: {
    ...Typography.button,
    color: Colors.gray700,
  },
  intentModalBtnPrimary: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: Colors.romance.primary,
  },
  intentModalBtnPrimaryText: {
    ...Typography.button,
    fontFamily: FontFamily.headingBold,
    color: Colors.white,
  },
});
