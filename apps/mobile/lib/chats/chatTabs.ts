import { Colors } from "@/constants/tokens";
import type { AppMode } from "@/lib/chats/types";
import type { Ionicons } from "@expo/vector-icons";

export type ChatTabKey = "all" | AppMode;

export type ChatTabConfig = {
  key: ChatTabKey;
  label: string;
  secondary: string;
  accent: string;
  icon?: keyof typeof Ionicons.glyphMap;
  useEventsImage?: boolean;
};

export const CHAT_TAB_CONFIG: ChatTabConfig[] = [
  { key: "all", label: "All", secondary: Colors.white, accent: Colors.primaryViolet },
  {
    key: "romance",
    label: "Romance",
    secondary: Colors.romance.secondary,
    accent: Colors.romance.primary,
    icon: "heart",
  },
  {
    key: "friends",
    label: "Friends",
    secondary: Colors.friends.secondary,
    accent: Colors.friends.primary,
    icon: "people",
  },
  {
    key: "business",
    label: "Business",
    secondary: Colors.business.secondary,
    accent: Colors.business.primary,
    icon: "briefcase",
  },
  {
    key: "events",
    label: "Events",
    secondary: Colors.events.secondary,
    accent: Colors.events.primary,
    useEventsImage: true,
    icon: "ticket",
  },
];

export function getChatTabsWithModeFirst(
  sourceMode: "romance" | "friends" | "business" | "events" | "all"
): ChatTabConfig[] {
  if (sourceMode === "all") return CHAT_TAB_CONFIG;
  const modeTab = CHAT_TAB_CONFIG.find((t) => t.key === sourceMode)!;
  const rest = CHAT_TAB_CONFIG.filter((t) => t.key !== sourceMode && t.key !== "all");
  return [modeTab, CHAT_TAB_CONFIG.find((t) => t.key === "all")!, ...rest];
}

export function filterConversationsByTab<T extends { mode: AppMode }>(
  items: T[],
  activeTab: ChatTabKey
): T[] {
  if (activeTab === "all") return items;
  return items.filter((item) => item.mode === activeTab);
}
