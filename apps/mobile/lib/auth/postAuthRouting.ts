// apps/mobile/lib/auth/postAuthRouting.ts
// Shared post-authentication routing (email, OAuth, deep link).

import type { Router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { Routes } from "@/constants/routes";
import { isBusinessProfileComplete, isPersonalProfileComplete } from "@/lib/routing/splash";

export async function routeAfterAuthentication(router: Router): Promise<void> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;

  const user = userData?.user;
  if (!user) {
    router.replace("/(auth)/signin");
    return;
  }

  const accountType = user.user_metadata?.account_type as string | undefined;

  if (!user.email_confirmed_at) {
    router.replace("/(auth)/verify");
    return;
  }

  const userId = user.id;
  if (accountType === "business") {
    const { data: bp } = await supabase
      .from("business_profiles")
      .select("business_name")
      .or(`id.eq.${userId},user_id.eq.${userId}`)
      .limit(1)
      .maybeSingle();
    const hasBusinessProfile = isBusinessProfileComplete(bp as { business_name?: string } | null);
    router.replace(hasBusinessProfile ? Routes.modeSelection : "/(auth)/welcome-back-setup");
    return;
  }

  const { data: up } = await supabase
    .from("user_profiles")
    .select("first_name, last_name, gender, birthday, city, core_photos")
    .eq("id", userId)
    .maybeSingle();
  const profileComplete = isPersonalProfileComplete(up as Parameters<typeof isPersonalProfileComplete>[0]);
  router.replace(profileComplete ? Routes.modeSelection : "/(auth)/welcome-back-setup");
}
