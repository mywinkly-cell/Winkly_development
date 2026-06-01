// ────────────────────────────────────────────────
// MatchCelebration — the emotional "It's a match!" moment.
// Full-screen overlay shown when two users like each other.
// Animated entrance + floating hearts; two overlapping avatars.
// ────────────────────────────────────────────────

import React, { useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Modal,
  Animated,
  Easing,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Typography, FontFamily, Layout } from "@/constants/tokens";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const AVATAR_SIZE = Math.min(140, SCREEN_WIDTH * 0.36);
const HEART_COUNT = 14;

export type MatchCelebrationProps = {
  visible: boolean;
  /** Current user's photo (left avatar). */
  selfPhotoUrl?: string | null;
  /** Matched user's photo (right avatar). */
  otherPhotoUrl?: string | null;
  /** Matched user's first name, used in the subtitle. */
  otherName: string;
  /** Primary CTA — open the conversation. */
  onSendMessage: () => void;
  /** Secondary CTA — dismiss and continue swiping. */
  onKeepSwiping: () => void;
};

const FALLBACK_AVATAR = "https://i.pravatar.cc/300?u=winkly-match";

function Heart({ delay, startX }: { delay: number; startX: number }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 3200,
        delay,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [progress, delay]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [120, -SCREEN_WIDTH],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.1, 0.8, 1],
    outputRange: [0, 0.9, 0.6, 0],
  });
  const scale = progress.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0.4, 1, 0.7],
  });
  const translateX = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, (startX % 2 === 0 ? 1 : -1) * 24, 0],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: startX,
        bottom: 0,
        opacity,
        transform: [{ translateY }, { translateX }, { scale }],
      }}
    >
      <Ionicons name="heart" size={18 + (startX % 16)} color={Colors.romance.primary} />
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
  const cardScale = useRef(new Animated.Value(0.6)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const leftAvatar = useRef(new Animated.Value(0)).current;
  const rightAvatar = useRef(new Animated.Value(0)).current;

  const hearts = useMemo(
    () =>
      Array.from({ length: HEART_COUNT }).map((_, i) => ({
        key: i,
        delay: (i * 220) % 3000,
        startX: 12 + ((i * 47) % Math.max(40, SCREEN_WIDTH - 40)),
      })),
    [],
  );

  useEffect(() => {
    if (visible) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      cardScale.setValue(0.6);
      cardOpacity.setValue(0);
      leftAvatar.setValue(0);
      rightAvatar.setValue(0);
      Animated.parallel([
        Animated.spring(cardScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.spring(leftAvatar, { toValue: 1, friction: 6, delay: 120, useNativeDriver: true }),
        Animated.spring(rightAvatar, { toValue: 1, friction: 6, delay: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, cardScale, cardOpacity, leftAvatar, rightAvatar]);

  const leftTranslate = leftAvatar.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] });
  const rightTranslate = rightAvatar.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onKeepSwiping}>
      <View style={styles.backdrop}>
        <View style={styles.heartLayer} pointerEvents="none">
          {hearts.map((h) => (
            <Heart key={h.key} delay={h.delay} startX={h.startX} />
          ))}
        </View>

        <Animated.View
          style={[styles.card, { opacity: cardOpacity, transform: [{ scale: cardScale }] }]}
        >
          <Text style={styles.title}>It&apos;s a match!</Text>
          <Text style={styles.subtitle}>
            You and {otherName || "someone"} liked each other.
          </Text>

          <View style={styles.avatarRow}>
            <Animated.View style={[styles.avatarWrap, { transform: [{ translateX: leftTranslate }] }]}>
              <Image
                source={{ uri: selfPhotoUrl || FALLBACK_AVATAR }}
                style={styles.avatar}
                resizeMode="cover"
              />
            </Animated.View>
            <View style={styles.heartBadge}>
              <Ionicons name="heart" size={26} color={Colors.white} />
            </View>
            <Animated.View
              style={[
                styles.avatarWrap,
                styles.avatarWrapRight,
                { transform: [{ translateX: rightTranslate }] },
              ]}
            >
              <Image
                source={{ uri: otherPhotoUrl || FALLBACK_AVATAR }}
                style={styles.avatar}
                resizeMode="cover"
              />
            </Animated.View>
          </View>

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
  heartLayer: {
    ...StyleSheet.absoluteFillObject,
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
