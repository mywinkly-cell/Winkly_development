/**
 * Resolves whether the user is in the global tabs hub or inside a mode sub-app,
 * and builds chat / planner paths that keep the correct bottom navigation.
 */

import { usePathname } from "expo-router";
import type { Href } from "expo-router";
import type { AppMode } from "@/lib/chats/types";

export type ModeHub = "tabs" | AppMode;

const MODE_HUBS: AppMode[] = ["romance", "friends", "business", "events"];

export function isAppMode(x: string): x is AppMode {
  return MODE_HUBS.includes(x as AppMode);
}

/** Infer hub from the current route (e.g. `/(modes)/romance/chats/start` → romance). */
export function getModeHubFromPathname(pathname: string): ModeHub {
  for (const mode of MODE_HUBS) {
    if (
      pathname.includes(`/(modes)/${mode}/`) ||
      pathname.includes(`/${mode}/chats`) ||
      pathname.includes(`/${mode}/planner`) ||
      pathname.includes(`/${mode}/discover`) ||
      pathname.match(new RegExp(`/${mode}(/|$)`))
    ) {
      return mode;
    }
  }
  return "tabs";
}

export function modeHubToAppMode(hub: ModeHub): AppMode | "all" {
  if (hub === "tabs") return "all";
  return hub;
}

export function appModeToHub(mode: AppMode | "all" | undefined | null): ModeHub {
  if (mode && mode !== "all" && isAppMode(mode)) return mode;
  return "tabs";
}

function modeChatsBase(hub: ModeHub): string {
  return hub === "tabs" ? "/chats" : `/(modes)/${hub}/chats`;
}

function modePlannerBase(hub: ModeHub): string {
  return hub === "tabs" ? "/planner" : `/(modes)/${hub}/planner`;
}

export const chatRoutes = {
  index(hub: ModeHub): Href {
    return modeChatsBase(hub) as Href;
  },
  start(hub: ModeHub): Href {
    return `${modeChatsBase(hub)}/start` as Href;
  },
  newChat(hub: ModeHub, mode?: AppMode): Href {
    const q = mode ? `?mode=${mode}` : "";
    return `${modeChatsBase(hub)}/new-chat${q}` as Href;
  },
  filters(hub: ModeHub): Href {
    return `${modeChatsBase(hub)}/filters` as Href;
  },
  conversation(
    hub: ModeHub,
    conversationId: string,
    params?: Record<string, string | undefined>
  ): string | Href {
    if (hub === "tabs") {
      const query = buildQuery(params);
      return query ? `/chats/${conversationId}?${query}` : `/chats/${conversationId}`;
    }
    return {
      pathname: `/(modes)/${hub}/chats/[conversationId]` as const,
      params: { conversationId, ...stripUndefined(params) },
    };
  },
  conversationInfo(hub: ModeHub, conversationId: string): string | Href {
    if (hub === "tabs") {
      return `/chats/conversation-info?conversationId=${encodeURIComponent(conversationId)}`;
    }
    return {
      pathname: `/(modes)/${hub}/chats/conversation-info` as const,
      params: { conversationId },
    };
  },
};

export const plannerRoutes = {
  index(hub: ModeHub): Href {
    return modePlannerBase(hub) as Href;
  },
  invitations(hub: ModeHub): Href {
    return `${modePlannerBase(hub)}/invitations` as Href;
  },
  settings(hub: ModeHub): Href {
    return `${modePlannerBase(hub)}/settings` as Href;
  },
  filters(hub: ModeHub): Href {
    return `${modePlannerBase(hub)}/filters` as Href;
  },
};

function stripUndefined(params?: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!params) return out;
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") out[k] = v;
  }
  return out;
}

function buildQuery(params?: Record<string, string | undefined>): string {
  const entries = Object.entries(stripUndefined(params));
  if (entries.length === 0) return "";
  return entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}

/** Current navigation hub from the route, with optional fallback when on global `/chats` screens. */
export function useModeHub(fallbackMode?: AppMode | "all" | null): ModeHub {
  const pathname = usePathname() ?? "";
  const fromPath = getModeHubFromPathname(pathname);
  if (fromPath !== "tabs") return fromPath;
  return appModeToHub(fallbackMode ?? null);
}
