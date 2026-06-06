/**
 * Keeps the active mode bottom navigation visible on stacked screens
 * (new chat, thread, planner invitations, etc.).
 */

import React from "react";
import { View } from "react-native";
import type { AppMode } from "@/lib/chats/types";
import { Colors } from "@/constants/tokens";
import { RomanceBottomNav } from "@/components/layout/RomanceBottomNav";
import { FriendsBottomNav } from "@/components/layout/FriendsBottomNav";
import { BusinessBottomNav } from "@/components/layout/BusinessBottomNav";
import { EventsBottomNav } from "@/components/layout/EventsBottomNav";

const MODE_NAV: Record<AppMode, React.ComponentType> = {
  romance: RomanceBottomNav,
  friends: FriendsBottomNav,
  business: BusinessBottomNav,
  events: EventsBottomNav,
};

type ModeShellProps = {
  mode: AppMode;
  children: React.ReactNode;
};

export function ModeShell({ mode, children }: ModeShellProps) {
  const BottomNav = MODE_NAV[mode];
  return (
    <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
      <View style={{ flex: 1 }}>{children}</View>
      <BottomNav />
    </View>
  );
}
