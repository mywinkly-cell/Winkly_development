// apps/mobile/app/(auth)/callback.tsx
// Handles deep link from email (verification, password reset) — parse URL, set session, route

import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { View, Text, ActivityIndicator } from "react-native";
import { createSessionFromUrl, isRecoveryUrl } from "@/lib/authDeepLink";
import { Colors } from "@/constants/tokens";
import { getTermsAndCookiesAccepted } from "@/lib/legalFlags";
import {
  clearPendingAuthCallbackUrl,
  getPendingAuthCallbackUrl,
  setPendingAuthCallbackUrl,
} from "@/lib/pendingAuthCallback";

export default function AuthCallback() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    let handled = false;

    const handleUrl = async (incomingUrl: string | null) => {
      if (handled) return;

      let url = incomingUrl;
      if (!url) {
        url = await getPendingAuthCallbackUrl();
      }
      if (!url) {
        router.replace("/(auth)/signin");
        return;
      }

      handled = true;

      const termsAccepted = await getTermsAndCookiesAccepted();
      if (!termsAccepted) {
        await setPendingAuthCallbackUrl(url);
        router.replace("/(auth)/terms-cookies?next=callback");
        return;
      }

      const ok = await createSessionFromUrl(url);
      if (!ok) {
        setStatus("error");
        return;
      }

      await clearPendingAuthCallbackUrl();
      setStatus("success");
      if (isRecoveryUrl(url)) {
        router.replace("/(auth)/reset-confirm");
      } else {
        router.replace("/(auth)/email-verified");
      }
    };

    const sub = Linking.addEventListener("url", ({ url }) => handleUrl(url));

    Linking.getInitialURL().then((initialUrl) => handleUrl(initialUrl));

    return () => sub.remove();
  }, [router]);

  if (status === "error") {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
        <Text style={{ color: Colors.textSecondary, textAlign: "center" }}>
          This link may have expired. Please try signing in again.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" color={Colors.primaryViolet} />
      <Text style={{ marginTop: 16, color: Colors.textSecondary }}>Completing sign in…</Text>
    </View>
  );
}
