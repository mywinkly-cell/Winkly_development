import { Colors } from "@/constants/tokens";
import type { AppMode } from "@/lib/chats/types";

export type ChatModeDisplay = {
  mode: AppMode;
  label: string;
  shortLabel: string;
  primary: string;
  secondary: string;
};

const MODE_DISPLAY: Record<AppMode, Omit<ChatModeDisplay, "mode">> = {
  romance: {
    label: "Romance",
    shortLabel: "R",
    primary: Colors.romance.primary,
    secondary: Colors.romance.secondary,
  },
  friends: {
    label: "Friends",
    shortLabel: "F",
    primary: Colors.friends.primary,
    secondary: Colors.friends.secondary,
  },
  business: {
    label: "Business",
    shortLabel: "B",
    primary: Colors.business.primary,
    secondary: Colors.business.secondary,
  },
  events: {
    label: "Events",
    shortLabel: "E",
    primary: Colors.events.primary,
    secondary: Colors.events.secondary,
  },
};

/** Mode colors + labels for mixed inbox rows (All tab). */
export function getChatModeDisplay(mode: AppMode | null | undefined): ChatModeDisplay | null {
  if (!mode || !(mode in MODE_DISPLAY)) return null;
  return { mode, ...MODE_DISPLAY[mode] };
}
