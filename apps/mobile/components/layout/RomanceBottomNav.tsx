// Romance Mode Bottom Nav — Home, Discover, Switch (center), Chats, Planner

import React from "react";
import { useRouter, usePathname } from "expo-router";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/tokens";
import { ModeBottomNavShell } from "@/components/layout/ModeBottomNavShell";

type RomanceTab = "home" | "discover" | "chats" | "planner";

function getActiveTab(pathname: string): RomanceTab {
  if (!pathname) return "home";
  if (pathname.includes("/discover")) return "discover";
  if (pathname.includes("/chats")) return "chats";
  if (pathname.includes("/planner")) return "planner";
  return "home";
}

export function RomanceBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const activeTab = getActiveTab(pathname ?? "");

  const nav = (tab: string) => {
    Haptics.selectionAsync();
    if (tab === "home") router.replace("/(modes)/romance");
    else if (tab === "discover") router.replace("/(modes)/romance/discover");
    else if (tab === "chats") router.replace("/(modes)/romance/chats");
    else router.replace("/(modes)/romance/planner");
  };

  return (
    <ModeBottomNavShell
      mode="romance"
      activeTab={activeTab}
      activeColor={Colors.romance.primary}
      onNav={nav}
    />
  );
}
