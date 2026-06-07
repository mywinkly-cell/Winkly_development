// Business Mode Bottom Nav — Home, Discover, Switch (center), Chats, Planner

import React from "react";
import { useRouter, usePathname } from "expo-router";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/tokens";
import { ModeBottomNavShell } from "@/components/layout/ModeBottomNavShell";

type BusinessTab = "home" | "discover" | "chats" | "planner";

function getActiveTab(pathname: string): BusinessTab {
  if (!pathname) return "home";
  if (pathname.includes("/discover")) return "discover";
  if (pathname.includes("/chats")) return "chats";
  if (pathname.includes("/planner")) return "planner";
  return "home";
}

export function BusinessBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const activeTab = getActiveTab(pathname ?? "");

  const nav = (tab: BusinessTab) => {
    Haptics.selectionAsync();
    if (tab === "home") router.replace("/(modes)/business");
    else if (tab === "discover") router.replace("/(modes)/business/discover");
    else if (tab === "chats") router.replace("/(modes)/business/chats");
    else router.replace("/(modes)/business/planner");
  };

  return (
    <ModeBottomNavShell
      mode="business"
      activeTab={activeTab}
      activeColor={Colors.business.primary}
      onNav={nav}
    />
  );
}
