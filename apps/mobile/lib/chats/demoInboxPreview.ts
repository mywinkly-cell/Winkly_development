import type { ChatTabKey } from "@/lib/chats/chatTabs";
import type { AppMode, Conversation } from "@/lib/chats/types";

export type DemoChatPreviewRow = {
  conversation: Conversation;
  chatName: string;
  lastMessagePreview: string;
  timestamp: string;
  unreadCount: number;
  isPinned: boolean;
  isPendingRomanceInvite?: boolean;
  isOnline?: boolean;
  participantAvatars: {
    userId: string;
    photoUrl?: string | null;
    placeholderEmoji?: string;
    placeholderBg?: string;
  }[];
};

const NOW = new Date().toISOString();

function demoConv(
  id: string,
  mode: AppMode,
  overrides: Partial<Conversation> & { name?: string | null } = {}
): Conversation {
  return {
    id,
    type: overrides.type ?? "dm",
    mode,
    created_by: "demo-me",
    created_at: NOW,
    updated_at: NOW,
    last_message_at: NOW,
    archived: false,
    name: overrides.name ?? null,
    related_event_id: overrides.related_event_id ?? null,
    related_group_id: overrides.related_group_id ?? null,
    is_system: false,
    system_type: null,
    expires_at: null,
    dm_source: overrides.dm_source ?? "match",
    dm_initiator: overrides.dm_initiator ?? null,
    romance_invite_status: overrides.romance_invite_status ?? null,
  };
}

const DEMO_ROWS: DemoChatPreviewRow[] = [
  {
    conversation: demoConv("demo-sofia", "romance", {
      dm_source: "invite",
      romance_invite_status: "pending",
    }),
    chatName: "Sofia",
    lastMessagePreview: "Did you see that jazz event? 🎵",
    timestamp: "9:38",
    unreadCount: 2,
    isPinned: false,
    isPendingRomanceInvite: true,
    isOnline: true,
    participantAvatars: [
      { userId: "demo-sofia", placeholderEmoji: "👩", placeholderBg: "#FCE4EC" },
    ],
  },
  {
    conversation: demoConv("demo-marco", "friends"),
    chatName: "Marco",
    lastMessagePreview: "Hike this Sunday? Count me in!",
    timestamp: "8:52",
    unreadCount: 1,
    isPinned: false,
    participantAvatars: [
      { userId: "demo-marco", placeholderEmoji: "👨", placeholderBg: "#FFF3E0" },
    ],
  },
  {
    conversation: demoConv("demo-munich-hikers", "friends", {
      type: "group",
      name: "Group: Munich Hikers",
    }),
    chatName: "Group: Munich Hikers",
    lastMessagePreview: "You: Looking forward to it!",
    timestamp: "Yesterday",
    unreadCount: 0,
    isPinned: false,
    participantAvatars: [
      { userId: "demo-g1", placeholderEmoji: "⛰️", placeholderBg: "#E8F5E9" },
    ],
  },
  {
    conversation: demoConv("demo-petra", "business"),
    chatName: "Petra Müller",
    lastMessagePreview: "Great meeting you at the event",
    timestamp: "Mon",
    unreadCount: 0,
    isPinned: false,
    isOnline: true,
    participantAvatars: [
      { userId: "demo-petra", placeholderEmoji: "👩‍💼", placeholderBg: "#E3F2FD" },
    ],
  },
  {
    conversation: demoConv("demo-lisa", "romance"),
    chatName: "Lisa",
    lastMessagePreview: "Super liked you ⭐",
    timestamp: "Sun",
    unreadCount: 3,
    isPinned: false,
    participantAvatars: [
      { userId: "demo-lisa", placeholderEmoji: "👩", placeholderBg: "#F3E5F5" },
    ],
  },
  {
    conversation: demoConv("demo-jazz-night", "events", {
      type: "event",
      name: "Event: Jazz Night",
    }),
    chatName: "Event: Jazz Night",
    lastMessagePreview: "Doors open at 20:30",
    timestamp: "Jun 12",
    unreadCount: 0,
    isPinned: false,
    participantAvatars: [],
  },
];

/** Design-reference inbox rows — shown when the live inbox is empty (dev preview). */
export function getDemoInboxPreview(activeTab: ChatTabKey): DemoChatPreviewRow[] {
  if (activeTab === "all") return DEMO_ROWS;
  return DEMO_ROWS.filter((row) => row.conversation.mode === activeTab);
}

export function shouldShowDemoInboxPreview(realCount: number): boolean {
  return __DEV__ && realCount === 0;
}
