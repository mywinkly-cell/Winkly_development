import type { TFunction } from "i18next";
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

const CHAT_TAB_STYLES: Omit<ChatTabConfig, "label">[] = [
  { key: "all", secondary: Colors.white, accent: Colors.primaryViolet },
  {
    key: "romance",
    secondary: Colors.romance.secondary,
    accent: Colors.romance.primary,
    icon: "heart",
  },
  {
    key: "friends",
    secondary: Colors.friends.secondary,
    accent: Colors.friends.primary,
    icon: "people",
  },
  {
    key: "business",
    secondary: Colors.business.secondary,
    accent: Colors.business.primary,
    icon: "briefcase",
  },
  {
    key: "events",
    secondary: Colors.events.secondary,
    accent: Colors.events.primary,
    useEventsImage: true,
    icon: "ticket",
  },
];

function tabLabel(key: ChatTabKey, t: TFunction): string {
  if (key === "all") return t("modes.all");
  return t(`modes.${key}`);
}

/** Build chat tab config with labels in the active app language. */
export function buildChatTabConfig(t: TFunction): ChatTabConfig[] {
  return CHAT_TAB_STYLES.map((style) => ({
    ...style,
    label: tabLabel(style.key, t),
  }));
}

/** @deprecated Use `useChatTabConfig()` — labels are English only. */
export const CHAT_TAB_CONFIG: ChatTabConfig[] = buildChatTabConfig(((key: string) => {
  const en: Record<string, string> = {
    "modes.all": "All",
    "modes.romance": "Romance",
    "modes.friends": "Friends",
    "modes.business": "Business",
    "modes.events": "Events",
  };
  return en[key] ?? key;
}) as TFunction);

export function getChatTabsWithModeFirst(
  sourceMode: "romance" | "friends" | "business" | "events" | "all",
  t: TFunction
): ChatTabConfig[] {
  const config = buildChatTabConfig(t);
  if (sourceMode === "all") return config;
  const modeTab = config.find((tab) => tab.key === sourceMode)!;
  const rest = config.filter((tab) => tab.key !== sourceMode && tab.key !== "all");
  return [modeTab, config.find((tab) => tab.key === "all")!, ...rest];
}

export function getChatTabAccent(key: ChatTabKey): string {
  return CHAT_TAB_STYLES.find((tab) => tab.key === key)?.accent ?? Colors.primaryViolet;
}

export function filterConversationsByTab<T extends { mode: AppMode }>(
  items: T[],
  activeTab: ChatTabKey
): T[] {
  if (activeTab === "all") return items;
  return items.filter((item) => item.mode === activeTab);
}
