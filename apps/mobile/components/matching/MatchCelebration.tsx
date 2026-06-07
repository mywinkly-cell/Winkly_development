// ────────────────────────────────────────────────
// MatchCelebration — the emotional "It's a match!" moment.
// Reanimated spring avatar reveal + particle burst + staggered CTAs.
// ────────────────────────────────────────────────

import React, { useEffect } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Modal,
  Dimensions,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Typography, FontFamily } from "@/constants/tokens";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const AVATAR_SIZE = Math.min(140, SCREEN_WIDTH * 0.36);
const SPRING_AVATAR = { damping: 14, stiffness: 180, mass: 0.85 };
const SPRING_BADGE = { damping: 12, stiffness: 220, mass: 0.7 };
const CTA_DELAY_MS = 520;

export type MatchCelebrationProps = {
  visible: boolean;
  selfPhotoUrl?: string | null;
  otherPhotoUrl?: string | null;
  otherName: string;
  onSendMessage: () => void;
  onKeepSwiping: () => void;
};

const FALLBACK_AVATAR = "https://i.pravatar.cc/300?u=winkly-match";

const BURST_PARTICLES = Array.from({ length: 18 }).map((_, i) => ({
  key: i,
  angle: (i / 18) * Math.PI * 2 + (i % 2 ? 0.12 : -0.08),
  distance: 72 + (i % 5) * 22,
  size: 10 + (i % 4) * 4,
  delay: (i % 6) * 35,
}));

function HeartBurstParticle({
  angle,
  distance,
  size,
  delay,
  active,
}: {
  angle: number;
  distance: number;
  size: number;
  delay: number;
  active: boolean;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      progress.value = 0;
      return;
    }
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }),
          withTiming(0, { duration: 0 }),
        ),
        -1,
        false,
      ),
    );
  }, [active, delay, progress]);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const radius = distance * p;
    return {
      opacity: p > 0 ? (1 - p) * 0.95 : 0,
      transform: [
        { translateX: Math.cos(angle) * radius },
        { translateY: Math.sin(angle) * radius - p * 28 },
        { scale: 0.35 + p * 0.85 },
        { rotate: `${p * 40}deg` },
      ],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.particle, style]}>
      <Ionicons name="heart" size={size} color={Colors.romance.primary} />
    </Animated.View>
  );
}

export function MatchCelebration({
  visible,
  selfPhotoUrl,
  otherPhotoUrl,
  otherName,
  onSendMessage,
  onKeepSwiping,
}: MatchCelebrationProps) {
  const cardOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.88);
  const leftScale = useSharedValue(0.6);
  const rightScale = useSharedValue(0.6);
  const leftTranslate = useSharedValue(-48);
  const rightTranslate = useSharedValue(48);
  const badgeScale = useSharedValue(0);
  const ctaOpacity = useSharedValue(0);
  const ctaTranslateY = useSharedValue(18);

  useEffect(() => {
    if (!visible) {
      cardOpacity.value = 0;
      cardScale.value = 0.88;
      leftScale.value = 0.6;
      rightScale.value = 0.6;
      leftTranslate.value = -48;
      rightTranslate.value = 48;
      badgeScale.value = 0;
      ctaOpacity.value = 0;
      ctaTranslateY.value = 18;
      return;
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    cardOpacity.value = withTiming(1, { duration: 220 });
    cardScale.value = withSpring(1, { damping: 16, stiffness: 160 });

    leftScale.value = withDelay(
      80,
      withSequence(withSpring(1.05, SPRING_AVATAR), withSpring(1, SPRING_AVATAR)),
    );
    rightScale.value = withDelay(
      160,
      withSequence(withSpring(1.05, SPRING_AVATAR), withSpring(1, SPRING_AVATAR)),
    );
    leftTranslate.value = withDelay(80, withSpring(0, SPRING_AVATAR));
    rightTranslate.value = withDelay(160, withSpring(0, SPRING_AVATAR));
    badgeScale.value = withDelay(
      240,
      withSequence(withSpring(1.18, SPRING_BADGE), withSpring(1, SPRING_BADGE)),
    );

    ctaOpacity.value = withDelay(CTA_DELAY_MS, withTiming(1, { duration: 280 }));
    ctaTranslateY.value = withDelay(CTA_DELAY_MS, withSpring(0, { damping: 18, stiffness: 190 }));
  }, [
    visible,
    badgeScale,
    cardOpacity,
    cardScale,
    ctaOpacity,
    ctaTranslateY,
    leftScale,
    leftTranslate,
    rightScale,
    rightTranslate,
  ]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  const leftAvatarStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: leftTranslate.value }, { scale: leftScale.value }],
  }));

  const rightAvatarStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: rightTranslate.value }, { scale: rightScale.value }],
  }));

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
  }));

  const ctaStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
    transform: [{ translateY: ctaTranslateY.value }],
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onKeepSwiping}>
      <View style={styles.backdrop}>
        <View style={styles.burstLayer} pointerEvents="none">
          {BURST_PARTICLES.map((p) => (
            <HeartBurstParticle
              key={p.key}
              angle={p.angle}
              distance={p.distance}
              size={p.size}
              delay={p.delay}
              active={visible}
            />
          ))}
        </View>

        <Animated.View style={[styles.card, cardStyle]}>
          <Text style={styles.title}>It&apos;s a match!</Text>
          <Text style={styles.subtitle}>You and {otherName || "someone"} liked each other.</Text>

          <View style={styles.avatarRow}>
            <Animated.View style={[styles.avatarWrap, leftAvatarStyle]}>
              <Image
                source={{ uri: selfPhotoUrl || FALLBACK_AVATAR }}
                style={styles.avatar}
                resizeMode="cover"
              />
            </Animated.View>
            <Animated.View style={[styles.heartBadge, badgeStyle]}>
              <Ionicons name="heart" size={26} color={Colors.white} />
            </Animated.View>
            <Animated.View style={[styles.avatarWrap, styles.avatarWrapRight, rightAvatarStyle]}>
              <Image
                source={{ uri: otherPhotoUrl || FALLBACK_AVATAR }}
                style={styles.avatar}
                resizeMode="cover"
              />
            </Animated.View>
          </View>

          <Animated.View style={[styles.ctaBlock, ctaStyle]}>
            <Pressable
              style={styles.primaryBtn}
              onPress={onSendMessage}
              accessibilityLabel="Send a message"
            >
              <Ionicons name="chatbubble-ellipses" size={20} color={Colors.white} />
              <Text style={styles.primaryBtnText}>Send a message</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryBtn}
              onPress={onKeepSwiping}
              accessibilityLabel="Keep swiping"
            >
              <Text style={styles.secondaryBtnText}>Keep swiping</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(20,8,20,0.82)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  burstLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  particle: {
    position: "absolute",
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: Colors.white,
    borderRadius: 28,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  title: {
    ...Typography.h1,
    fontFamily: FontFamily.heading,
    fontSize: 34,
    color: Colors.romance.primary,
    textAlign: "center",
  },
  subtitle: {
    ...Typography.body,
    color: Colors.gray700,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 28,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 4,
    borderColor: Colors.white,
    overflow: "hidden",
    backgroundColor: Colors.gray200,
    marginRight: -18,
    shadowColor: Colors.romance.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  avatarWrapRight: {
    marginRight: 0,
    marginLeft: -18,
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  heartBadge: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.romance.primary,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    borderWidth: 3,
    borderColor: Colors.white,
    shadowColor: Colors.romance.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  ctaBlock: {
    width: "100%",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: Colors.romance.primary,
    marginBottom: 12,
  },
  primaryBtnText: {
    ...Typography.button,
    fontFamily: FontFamily.heading,
    color: Colors.white,
    fontSize: 16,
  },
  secondaryBtn: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    ...Typography.button,
    color: Colors.gray600,
  },
});
