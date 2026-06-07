// lib/account/accountTypeSwitch.ts
// Switch or create the other account type under the same email (same auth user).

import type { Router } from "expo-router";
import type { AccountType } from "@/types";
import { Routes } from "@/constants/routes";
import { supabase } from "@/lib/supabase";
import { isBusinessProfileComplete, isPersonalProfileComplete } from "@/lib/routing/splash";

export type AccountProfileStatus = {
  hasPersonal: boolean;
  hasBusiness: boolean;
};

export async function fetchAccountProfileStatus(userId: string): Promise<AccountProfileStatus> {
  const [{ data: personal }, { data: business }] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("first_name, last_name, gender, birthday, city, core_photos")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("business_profiles")
      .select("business_name")
      .or(`id.eq.${userId},user_id.eq.${userId}`)
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    hasPersonal: isPersonalProfileComplete(personal as Parameters<typeof isPersonalProfileComplete>[0]),
    hasBusiness: isBusinessProfileComplete(business as { business_name?: string } | null),
  };
}

export async function setActiveAccountType(targetType: AccountType): Promise<void> {
  const { error: metaErr } = await supabase.auth.updateUser({ data: { account_type: targetType } });
  if (metaErr) throw metaErr;

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const userId = userData?.user?.id;
  if (!userId) throw new Error("Not signed in");

  const { error: rowErr } = await supabase
    .from("users")
    .update({ account_type: targetType })
    .eq("id", userId);
  if (rowErr) throw rowErr;
}

export function accountTypeActionVerb(
  targetType: AccountType,
  status: AccountProfileStatus
): "create" | "switch" {
  return targetType === "business"
    ? status.hasBusiness
      ? "switch"
      : "create"
    : status.hasPersonal
      ? "switch"
      : "create";
}

export async function routeAfterAccountTypeChange(
  router: Router,
  targetType: AccountType,
  status: AccountProfileStatus
): Promise<void> {
  const verb = accountTypeActionVerb(targetType, status);
  if (targetType === "business") {
    router.replace(verb === "create" ? "/(onboarding-business)/get-started-business" : Routes.modeSelection);
    return;
  }
  router.replace(verb === "create" ? "/(onboarding-personal)/profile-core?edit=1" : Routes.modeSelection);
}
