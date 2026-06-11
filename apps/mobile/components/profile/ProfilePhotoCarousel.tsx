import React, { useRef, useState } from "react";
import {
  View,
  Image,
  ScrollView,
  Dimensions,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/tokens";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type ProfilePhotoCarouselProps = {
  photos: string[];
  /** Height ratio relative to screen width (default 1.1). */
  aspectRatio?: number;
};

/**
 * Full-width horizontal photo carousel — swipe left/right through every photo.
 * Used on the own-profile preview and can replace hero+thumbnails elsewhere.
 */
export function ProfilePhotoCarousel({ photos, aspectRatio = 1.1 }: ProfilePhotoCarouselProps) {
  const height = SCREEN_WIDTH * aspectRatio;
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / SCREEN_WIDTH);
    if (idx !== activeIndex && idx >= 0 && idx < photos.length) {
      setActiveIndex(idx);
    }
  };

  if (photos.length === 0) {
    return (
      <View style={[styles.slide, { height }]}>
        <View style={styles.placeholder}>
          <Ionicons name="person" size={72} color={Colors.gray400} />
        </View>
      </View>
    );
  }

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
        bounces={photos.length > 1}
      >
        {photos.map((uri) => (
          <View key={uri} style={[styles.slide, { width: SCREEN_WIDTH, height }]}>
            <Image source={{ uri }} style={styles.image} resizeMode="cover" />
          </View>
        ))}
      </ScrollView>
      {photos.length > 1 ? (
        <View style={styles.dots} pointerEvents="none">
          {photos.map((uri, i) => (
            <View
              key={`dot-${uri}-${i}`}
              style={[styles.dot, i === activeIndex && styles.dotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    backgroundColor: Colors.gray200,
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.gray100,
  },
  dots: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  dotActive: {
    backgroundColor: Colors.white,
    width: 18,
  },
});
