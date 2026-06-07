// Friends Mode Bottom Nav — Home, Discover, Switch (center), Chats, Planner

import React from "react";
import { useRouter, usePathname } from "expo-router";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/tokens";
import { ModeBottomNavShell } from "@/components/layout/ModeBottomNavShell";

type FriendsTab = "home" | "discover" | "chats" | "planner";

function getActiveTab(pathname: string): FriendsTab {
  if (!pathname) return "home";
  if (pathname.includes("/discover")) return "discover";
  if (pathname.includes("/chats")) return "chats";
  if (pathname.includes("/planner")) return "planner";
  return "home";
}

export function FriendsBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const activeTab = getActiveTab(pathname ?? "");

  const nav = (tab: FriendsTab) => {
    Haptics.selectionAsync();
    if (tab === "home") router.replace("/(modes)/friends");
    else if (tab === "discover") router.replace("/(modes)/friends/discover");
    else if (tab === "chats") router.replace("/(modes)/friends/chats");
    else router.replace("/(modes)/friends/planner");
  };

  return (
    <ModeBottomNavShell
      mode="friends"
      activeTab={activeTab}
      activeColor={Colors.friends.primary}
      onNav={nav}
    />
  );
}
