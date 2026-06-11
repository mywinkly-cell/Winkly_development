import i18n from "i18next";
import { Colors } from "@/constants/tokens";
import type { AppMode } from "@/lib/chats/types";
import type { Ionicons } from "@expo/vector-icons";

export type ChatModeDisplay = {
  mode: AppMode;
  label: string;
  shortLabel: string;
  primary: string;
  secondary: string;
  icon: keyof typeof Ionicons.glyphMap;
  useEventsImage?: boolean;
};

const MODE_STYLE: Record<AppMode, Omit<ChatModeDisplay, "mode" | "label">> = {
  romance: {
    shortLabel: "R",
    primary: Colors.romance.primary,
    secondary: Colors.romance.secondary,
    icon: "heart",
  },
  friends: {
    shortLabel: "F",
    primary: Colors.friends.primary,
    secondary: Colors.friends.secondary,
    icon: "people",
  },
  business: {
    shortLabel: "B",
    primary: Colors.business.primary,
    secondary: Colors.business.secondary,
    icon: "briefcase",
  },
  events: {
    shortLabel: "E",
    primary: Colors.events.primary,
    secondary: Colors.events.secondary,
    icon: "ticket",
    useEventsImage: true,
  },
};

/** Mode colors + labels for mixed inbox rows (All tab). Labels follow app language. */
export function getChatModeDisplay(mode: AppMode | null | undefined): ChatModeDisplay | null {
  if (!mode || !(mode in MODE_STYLE)) return null;
  return {
    mode,
    label: i18n.t(`modes.${mode}`),
    ...MODE_STYLE[mode],
  };
}
