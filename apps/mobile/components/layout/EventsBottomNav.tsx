// Events Mode Bottom Nav — Home, Discover, Switch (center), Chats, Planner

import React from "react";
import { useRouter, usePathname } from "expo-router";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/tokens";
import { ModeBottomNavShell } from "@/components/layout/ModeBottomNavShell";

type EventsTab = "home" | "discover" | "chats" | "planner";

function getActiveTab(pathname: string): EventsTab {
  if (!pathname) return "home";
  if (pathname.includes("/discover")) return "discover";
  if (pathname.includes("/chats")) return "chats";
  if (pathname.includes("/planner")) return "planner";
  return "home";
}

export function EventsBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const activeTab = getActiveTab(pathname ?? "");

  const nav = (tab: string) => {
    Haptics.selectionAsync();
    if (tab === "home") router.replace("/(modes)/events");
    else if (tab === "discover") router.replace("/(modes)/events/discover");
    else if (tab === "chats") router.replace("/(modes)/events/chats");
    else router.replace("/(modes)/events/planner");
  };

  return (
    <ModeBottomNavShell
      mode="events"
      activeTab={activeTab}
      activeColor={Colors.events.primary}
      onNav={nav}
    />
  );
}
