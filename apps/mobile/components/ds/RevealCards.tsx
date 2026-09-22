// apps/mobile/components/ds/RevealCards.tsx
// Design-system primitive: results arrive face-down and flip over one by one, like opening a
// present. Used by the Concierge planning flow; built to be reused by Weekly Spark and G2.
//
// Performance: every frame runs on the UI thread (Reanimated worklets, transform + opacity only,
// no layout animation), and the flipping faces are rasterised on Android while they move.
// Accessibility: with OS "Reduce motion" on, cards simply fade in together — no flip, no stagger.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, type SpacingKey } from "@/constants/design-system";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import {
  REVEAL_FADE_MS,
  REVEAL_FLIP_MS,
  REVEAL_STAGGER_MS,
  flipFaces,
  revealDelayMs,
} from "./revealCardsTiming";

const PERSPECTIVE = 1200;
const BACK_ICON_SIZE = 32;

export type RevealCardsProps<T> = {
  items: readonly T[];
  keyExtractor: (item: T, index: number) => string;
  /** The face-up card. Its height sets the size of the face-down back. */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Change it to replay the reveal (e.g. a new set of results). */
  revealKey: string | number;
  /** false → show face-up immediately (e.g. returning to results already revealed). Default true. */
  animate?: boolean;
  /** Delay between cards. Default 120 ms. */
  staggerMs?: number;
  /** Light haptic as each card turns. Default true. */
  haptics?: boolean;
  /** Vertical gap between cards (spacing token). Default "lg". */
  gap?: SpacingKey;
  /** Called once every card is face-up. */
  onRevealed?: (revealKey: string | number) => void;
  style?: StyleProp<ViewStyle>;
};

export function RevealCards<T>({
  items,
  keyExtractor,
  renderItem,
  revealKey,
  animate = true,
  staggerMs = REVEAL_STAGGER_MS,
  haptics = true,
  gap = "lg",
  onRevealed,
  style,
}: RevealCardsProps<T>) {
  const theme = useAppTheme();
  const reduceMotion = useReduceMotion();
  const landedRef = useRef<{ key: string | number; count: number }>({ key: revealKey, count: 0 });
  const onRevealedRef = useRef(onRevealed);
  useEffect(() => {
    onRevealedRef.current = onRevealed;
  });
  const total = items.length;

  const handleLanded = useCallback(() => {
    if (landedRef.current.key !== revealKey) landedRef.current = { key: revealKey, count: 0 };
    landedRef.current.count += 1;
    if (landedRef.current.count === total) onRevealedRef.current?.(revealKey);
  }, [revealKey, total]);

  if (total === 0) return null;

  return (
    <View style={[{ gap: theme.spacing[gap] }, style]}>
      {items.map((item, index) => (
        <RevealCardItem
          key={`${revealKey}:${keyExtractor(item, index)}`}
          delayMs={reduceMotion ? 0 : revealDelayMs(index, staggerMs)}
          animate={animate}
          reduceMotion={reduceMotion}
          // Reduced motion: one soft tap for the whole set instead of one per card.
          haptic={haptics && animate && (!reduceMotion || index === 0)}
          onLanded={handleLanded}
        >
          {renderItem(item, index)}
        </RevealCardItem>
      ))}
    </View>
  );
}

function fireLightHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

type RevealCardItemProps = {
  delayMs: number;
  animate: boolean;
  reduceMotion: boolean;
  haptic: boolean;
  onLanded: () => void;
  children: React.ReactNode;
};

function RevealCardItem({ delayMs, animate, reduceMotion, haptic, onLanded, children }: RevealCardItemProps) {
  const theme = useAppTheme();
  const progress = useSharedValue(animate ? 0 : 1);
  const [landed, setLanded] = useState(!animate);

  const land = useCallback(() => {
    setLanded(true);
    onLanded();
  }, [onLanded]);

  // Start once on mount; a new reveal remounts the item via its key.
  useEffect(() => {
    if (!animate) {
      onLanded();
      return;
    }
    if (reduceMotion && haptic) fireLightHaptic();
    progress.value = withDelay(
      delayMs,
      withTiming(
        1,
        {
          duration: reduceMotion ? REVEAL_FADE_MS : REVEAL_FLIP_MS,
          easing: reduceMotion ? Easing.linear : Easing.out(Easing.cubic),
        },
        (finished) => {
          "worklet";
          if (finished) scheduleOnRN(land);
        }
      )
    );
    return () => cancelAnimation(progress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Haptic at the moment the card turns face-up (flip midpoint), not on a JS timer.
  useAnimatedReaction(
    () => progress.value >= 0.5,
    (turned, prev) => {
      if (haptic && !reduceMotion && turned && prev === false) scheduleOnRN(fireLightHaptic);
    },
    [haptic, reduceMotion]
  );

  const frontStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: progress.value, transform: [] };
    const f = flipFaces(progress.value);
    return {
      opacity: f.frontVisible ? 1 : 0,
      transform: [{ perspective: PERSPECTIVE }, { rotateY: `${f.frontDeg}deg` }],
    };
  }, [reduceMotion]);

  const backStyle = useAnimatedStyle(() => {
    const f = flipFaces(progress.value);
    return {
      opacity: f.frontVisible ? 0 : 1,
      transform: [{ perspective: PERSPECTIVE }, { rotateY: `${f.backDeg}deg` }],
    };
  });

  return (
    <View>
      <Animated.View
        style={frontStyle}
        pointerEvents={landed ? "auto" : "none"}
        renderToHardwareTextureAndroid={!landed}
      >
        {children}
      </Animated.View>
      {!landed && !reduceMotion ? (
        <Animated.View
          pointerEvents="none"
          renderToHardwareTextureAndroid
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: theme.colors.primary,
              borderRadius: theme.radii.lg,
              alignItems: "center",
              justifyContent: "center",
            },
            theme.elevation(1),
            backStyle,
          ]}
        >
          <Ionicons name="gift-outline" size={BACK_ICON_SIZE} color={theme.colors.onPrimary} />
        </Animated.View>
      ) : null}
    </View>
  );
}
