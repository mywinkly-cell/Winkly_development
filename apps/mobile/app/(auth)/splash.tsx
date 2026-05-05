// apps/mobile/app/(auth)/splash.tsx
// Winkly Splash Screen – Premium, calm (SDK 54)
// Violet background; emoji winks joyfully; splash lasts wink duration + 2s.

import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Image } from "react-native";
import { useRouter } from "expo-router";
import { Colors, Typography, FontFamily } from "@/constants/tokens";
import { getIntroSeen, clearIntroSeen } from "@/lib/introFlags";
import { supabase } from "@/lib/supabase";

const WINK_DURATION_MS = 1300;
const HOLD_AFTER_WINK_MS = 2000;
const SPLASH_TOTAL_MS = WINK_DURATION_MS + HOLD_AFTER_WINK_MS;

export default function Splash() {
  const router = useRouter();

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const emojiScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const winkStart = 400;
    const wink = Animated.sequence([
      Animated.delay(winkStart),
      Animated.timing(emojiScale, {
        toValue: 1.12,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(emojiScale, {
        toValue: 0.88,
        duration: 280,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(emojiScale, {
        toValue: 1.08,
        duration: 200,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.timing(emojiScale, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    wink.start();

    const t = setTimeout(async () => {
      try {
        const seen = await getIntroSeen();

        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          if (!seen) {
            router.replace("/(auth)/welcome-intro");
          } else {
            router.replace("/(auth)/signin");
          }
          return;
        }

        // Validate session with server — clear if stale (e.g. user deleted in Supabase)
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          await supabase.auth.signOut({ scope: "local" });
          await clearIntroSeen();
          router.replace("/(auth)/welcome-intro");
          return;
        }

        if (!session.user.email_confirmed_at) {
          router.replace("/(auth)/verify");
          return;
        }

        const accountType = session.user.user_metadata?.account_type as string | undefined;
        const userId = session.user.id;
        if (accountType === "business") {
          const { data: bp } = await supabase.from("business_profiles").select("business_name").or(`id.eq.${userId},user_id.eq.${userId}`).limit(1).maybeSingle();
          const hasProfile = !!(bp as any)?.business_name?.trim?.();
          router.replace(hasProfile ? "/(onboarding-personal)/mode-selection" : "/(auth)/welcome-back-setup");
        } else {
          const { data: up } = await supabase.from("user_profiles").select("first_name, last_name, gender, birthday, city, core_photos").eq("id", userId).maybeSingle();
          const u = up as any;
          const hasCore = !!(u?.first_name?.trim?.() && u?.last_name?.trim?.() && u?.gender?.trim?.() && u?.birthday && u?.city?.trim?.());
          const hasPhoto = Array.isArray(u?.core_photos) ? u.core_photos.filter(Boolean).length > 0 : false;
          const profileComplete = hasCore && hasPhoto;
          router.replace(profileComplete ? "/(onboarding-personal)/mode-selection" : "/(auth)/welcome-back-setup");
        }
      } catch {
        // If anything throws (network, Supabase, etc.), send to welcome-intro so app doesn't crash or blink
        router.replace("/(auth)/welcome-intro");
      }
    }, SPLASH_TOTAL_MS);

    return () => clearTimeout(t);
  }, [opacity, scale, emojiScale, router]);

  return (
    <Animated.View style={[styles.container, { backgroundColor: Colors.primaryViolet }]}>
      <Animated.View
        style={[
          styles.center,
          {
            opacity,
            transform: [{ scale }],
          },
        ]}
      >
        <Animated.View style={{ transform: [{ scale: emojiScale }] }}>
          <Image
            source={require("../../assets/icons/winkly-emoji-shadow.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.Text style={[styles.title, { color: "#FFFFFF" }]}>
          Winkly
        </Animated.Text>

        <Animated.Text style={[styles.subtitle, { color: "rgba(255,255,255,0.85)" }]}>
          Where every connection starts with a wink 😉
        </Animated.Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  center: {
    alignItems: "center",
    width: "100%",
  },
  logo: {
    width: 156,
    height: 156,
    marginBottom: 14,
  },
  title: {
    ...(Typography?.h2 ?? {}),
    fontFamily: FontFamily.heading,
    letterSpacing: 0,
    textAlign: "center",
    fontWeight: "800",
    paddingHorizontal: 12,
  },
  subtitle: {
    ...(Typography?.caption ?? {}),
    marginTop: 8,
    textAlign: "center",
    maxWidth: 300,
  },
});
