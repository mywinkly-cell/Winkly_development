// apps/mobile/lib/supabase.ts
import "react-native-url-polyfill/auto";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase environment variables are missing. " +
    "Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY."
  );
}

// Android emulator: localhost points to the emulator, not the host. Use 10.0.2.2.
const resolveUrl = (input: RequestInfo | URL): string => {
  const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
  if (__DEV__ && Platform.OS === "android" && (url.includes("localhost") || url.includes("127.0.0.1"))) {
    return url.replace(/localhost/g, "10.0.2.2").replace(/127\.0\.0\.1/g, "10.0.2.2");
  }
  return url;
};

const customFetch: typeof fetch = (input, init) => {
  const url = resolveUrl(input);
  const resolvedInput =
    typeof input === "string" || input instanceof URL ? url : new Request(url, input as Request);
  return fetch(resolvedInput, init);
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: customFetch },
  auth: {
    storage: AsyncStorage,

    // ✅ REQUIRED for React Native
    persistSession: true,

    // ✅ Keeps session alive when it exists
    autoRefreshToken: true,

    /**
     * VERY IMPORTANT:
     * In Expo / React Native we DO NOT want Supabase
     * trying to read auth tokens from URL.
     *
     * Email verification happens in browser,
     * NOT inside the app.
     */
    detectSessionInUrl: false,
  },
});
