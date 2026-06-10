// Business Mode Bottom Nav — Home, BA (business accounts) or Discover, Switch, Chats, Planner

import React from "react";
import { useRouter, usePathname } from "expo-router";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/tokens";
import { Routes } from "@/constants/routes";
import { useAuth } from "@/providers";
import {
  DEFAULT_MODE_NAV_TABS,
  ModeBottomNavShell,
  type ModeNavTab,
} from "@/components/layout/ModeBottomNavShell";

type BusinessTab = "home" | "discover" | "analytics" | "chats" | "planner";

const BUSINESS_ACCOUNT_TABS: ModeNavTab[] = [
  { key: "home", label: "Home", icon: "home" },
  { key: "analytics", label: "BA", icon: "stats-chart-outline" },
  { key: "chats", label: "Chats", icon: "chatbubble-outline" },
  { key: "planner", label: "Planner", icon: "calendar-outline" },
];

function getActiveTab(pathname: string): BusinessTab {
  if (!pathname) return "home";
  if (pathname.includes("/analytics") || pathname.includes("/business/analytics")) return "analytics";
  if (pathname.includes("/discover")) return "discover";
  if (pathname.includes("/chats")) return "chats";
  if (pathname.includes("/planner")) return "planner";
  return "home";
}

export function BusinessBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { accountType } = useAuth();
  const isBusinessAccount = accountType === "business";
  const activeTab = getActiveTab(pathname ?? "");
  const tabs = isBusinessAccount ? BUSINESS_ACCOUNT_TABS : DEFAULT_MODE_NAV_TABS;

  const nav = (tab: string) => {
    Haptics.selectionAsync();
    if (tab === "home") router.replace(Routes.modeBusiness);
    else if (tab === "analytics") router.replace(Routes.businessAnalytics);
    else if (tab === "discover") router.replace(Routes.modeBusinessDiscover);
    else if (tab === "chats") router.replace(Routes.modeBusinessChats);
    else router.replace(Routes.modeBusinessPlanner);
  };

  return (
    <ModeBottomNavShell
      mode="business"
      activeTab={activeTab}
      activeColor={Colors.business.primary}
      onNav={nav}
      tabs={tabs}
    />
  );
}
