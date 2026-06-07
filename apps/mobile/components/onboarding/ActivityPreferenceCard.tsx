import React, { useRef } from "react";
import { Animated, Pressable, Text, View, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { Colors, Typography } from "@/constants/tokens";
import type { ActivityPreferenceOption } from "@/constants/profileOptions";

const CARD_SIZE = 72;

type Props = {
  option: ActivityPreferenceOption;
  selected: boolean;
  suggested?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export function ActivityPreferenceCard({
  option,
  selected,
  suggested = false,
  disabled = false,
  onPress,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.92,
      useNativeDriver: true,
      speed: 48,
      bounciness: 0,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 42,
      bounciness: 5,
    }).start();
  };

  const handlePress = () => {
    void Haptics.selectionAsync();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={styles.wrap}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={option.label}
    >
      <Animated.View
        style={[
          styles.card,
          selected && styles.cardSelected,
          suggested && !selected && styles.cardSuggested,
          disabled && styles.cardDisabled,
          { transform: [{ scale }] },
        ]}
      >
        {selected ? <View style={styles.glowRing} pointerEvents="none" /> : null}
        <Text style={styles.emoji}>{option.emoji}</Text>
        <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={2}>
          {option.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: CARD_SIZE + 8,
    margin: 4,
    alignItems: "center",
  },
  card: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    overflow: "hidden",
  },
  cardSuggested: {
    borderColor: Colors.primaryViolet + "55",
    backgroundColor: Colors.primaryViolet + "08",
  },
  cardSelected: {
    borderColor: Colors.primaryViolet,
    backgroundColor: Colors.primaryViolet + "18",
    shadowColor: Colors.primaryViolet,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  cardDisabled: {
    opacity: 0.38,
  },
  glowRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.primaryViolet + "66",
  },
  emoji: {
    fontSize: 32,
    lineHeight: 36,
    marginBottom: 2,
  },
  label: {
    ...Typography.caption,
    fontSize: 11,
    lineHeight: 12,
    textAlign: "center",
    color: Colors.textPrimary,
  },
  labelSelected: {
    color: Colors.primaryViolet,
    fontWeight: "700",
  },
});
