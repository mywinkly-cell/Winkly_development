import React, { useEffect, useMemo, useRef } from "react";
import { Animated, View, StyleSheet } from "react-native";
import { Colors } from "@/constants/tokens";

const BAR_COUNT = 16;

type Props = {
  active: boolean;
  accentColor?: string;
};

export function RecordingWaveform({ active, accentColor = Colors.errorRed }: Props) {
  const bars = useMemo(
    () => Array.from({ length: BAR_COUNT }).map(() => new Animated.Value(0.25)),
    [],
  );
  const tick = useRef(0);

  useEffect(() => {
    if (!active) {
      bars.forEach((bar) => bar.setValue(0.25));
      return;
    }

    const id = setInterval(() => {
      tick.current += 1;
      bars.forEach((bar, i) => {
        const wave = 0.25 + Math.abs(Math.sin(tick.current * 0.35 + i * 0.55)) * 0.65;
        const jitter = ((i * 17 + tick.current * 13) % 10) / 40;
        Animated.timing(bar, {
          toValue: Math.min(1, wave + jitter),
          duration: 90,
          useNativeDriver: false,
        }).start();
      });
    }, 110);

    return () => clearInterval(id);
  }, [active, bars]);

  return (
    <View style={styles.track} accessibilityLabel="Recording waveform">
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              backgroundColor: accentColor,
              height: bar.interpolate({
                inputRange: [0, 1],
                outputRange: [4, 22],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 2,
    minHeight: 24,
    paddingHorizontal: 2,
  },
  bar: {
    flex: 1,
    borderRadius: 2,
    minWidth: 3,
  },
});
