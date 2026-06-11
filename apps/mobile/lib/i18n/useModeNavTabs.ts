import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ModeNavTab } from "@/components/layout/ModeBottomNavShell";

/** Translated default mode bottom-nav tabs (Home, Discover, Chats, Planner). */
export function useDefaultModeNavTabs(): ModeNavTab[] {
  const { t, i18n } = useTranslation();
  return useMemo(
    () => [
      { key: "home", label: t("nav.home"), icon: "home" },
      { key: "discover", label: t("modes.discover"), icon: "search" },
      { key: "chats", label: t("modes.chats"), icon: "chatbubble-outline" },
      { key: "planner", label: t("modes.planner"), icon: "calendar-outline" },
    ],
    [t, i18n.language]
  );
}

/** Business account tabs (Home, BA analytics, Chats, Planner). */
export function useBusinessAccountNavTabs(): ModeNavTab[] {
  const { t, i18n } = useTranslation();
  return useMemo(
    () => [
      { key: "home", label: t("nav.home"), icon: "home" },
      { key: "analytics", label: t("nav.analytics"), icon: "stats-chart-outline" },
      { key: "chats", label: t("modes.chats"), icon: "chatbubble-outline" },
      { key: "planner", label: t("modes.planner"), icon: "calendar-outline" },
    ],
    [t, i18n.language]
  );
}
