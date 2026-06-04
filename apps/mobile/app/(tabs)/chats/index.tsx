import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";

import type { AppMode, Conversation, ConversationMember, Message, UserMini } from "@/lib/chats";
import { formatChatInboxTimestamp, loadChatInbox, sortChatInboxItems } from "@/lib/chats/inbox";
import { ChatPreviewCard } from "@/components/chats/ChatPreviewCard";
import { ChatsHeader } from "@/components/layout/ChatsHeader";
import { Button } from "@/components/ui/Button";
import { Colors, Layout, Typography } from "@/constants/tokens";
import { useModeContext } from "@/providers";

type ChatTabKey = "all" | AppMode;

const TABS: { key: ChatTabKey; label: string; secondary: string; accent: string }[] = [
  { key: "all", label: "All", secondary: Colors.white, accent: Colors.primaryViolet },
  { key: "romance", label: "Romance", secondary: Colors.romance.secondary, accent: Colors.romance.primary },
  { key: "friends", label: "Friends", secondary: Colors.friends.secondary, accent: Colors.friends.primary },
  { key: "business", label: "Business", secondary: Colors.business.secondary, accent: Colors.business.primary },
  { key: "events", label: "Events", secondary: Colors.events.secondary, accent: Colors.events.primary },
];

function isChatMode(x: unknown): x is AppMode {
  return x === "romance" || x === "friends" || x === "business" || x === "events";
}

function formatName(u?: UserMini | null) {
  if (!u) return "Unknown";
  const fn = (u.first_name ?? "").trim();
  const ln = (u.last_name ?? "").trim();
  const full = `${fn} ${ln}`.trim();
  return full || "Unknown";
}

export default function ChatsHome() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const { context: modeContext } = useModeContext();

  const initialTab = useMemo<"all" | AppMode>(() => {
    if (isChatMode(params.mode)) return params.mode;
    return "all";
  }, [params.mode]);

  const [activeTab, setActiveTab] = useState<"all" | AppMode>(initialTab);
  const [loading, setLoading] = useState<boolean>(true);
  const [items, setItems] = useState<Conversation[]>([]);
  const [, setError] = useState<string | null>(null);

  // hydrated UI maps
  const [meId, setMeId] = useState<string | null>(null);
  const [participantsByConv, setParticipantsByConv] = useState<Record<string, ConversationMember[]>>({});
  const [usersById, setUsersById] = useState<Record<string, UserMini>>({});
  const [lastMessageByConv, setLastMessageByConv] = useState<Record<string, Message>>({});
  const [memberSettingsByConv, setMemberSettingsByConv] = useState<Record<string, { pinned: boolean; last_read_at: string | null }>>({});
  const [unreadByConv, setUnreadByConv] = useState<Record<string, number>>({});

  // Keep state synced with URL query
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMeId(data.user?.id ?? null);
    })();
  }, []);

  const goNewChat = () => {
    const m = activeTab === "all" ? "friends" : activeTab;
    router.push(`/chats/new-chat?mode=${m}`);
  };

  async function loadConversationsAndMeta() {
    setLoading(true);
    setError(null);

    try {
      const data = await loadChatInbox(activeTab);
      setItems(data.conversations);
      setParticipantsByConv(data.participantsByConv);
      setLastMessageByConv(data.lastMessageByConv);
      setUsersById(data.usersById);
      setMemberSettingsByConv(data.memberSettingsByConv);
      setUnreadByConv(data.unreadByConv);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load chats.");
      setItems([]);
      setParticipantsByConv({});
      setLastMessageByConv({});
      setUsersById({});
      setMemberSettingsByConv({});
      setUnreadByConv({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadConversationsAndMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // realtime refresh (simple + reliable)
  useEffect(() => {
    const channel = supabase
      .channel("chats_hub_updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => loadConversationsAndMeta()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => loadConversationsAndMeta()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);


  function getConversationTitle(conv: Conversation): string {
    if (conv.type === "dm") {
      const parts = participantsByConv[conv.id] ?? [];
      const otherId = parts.find((p) => p.user_id !== meId)?.user_id ?? null;
      return formatName(otherId ? usersById[otherId] : null);
    }

    if (conv.name) return conv.name;
    if (conv.type === "event") {
      // Later: join events table to show title.
      return "Event chat";
    }

    return "Group chat";
  }

  /** Avatar photo per participant: use mode-specific main photo when available (conversation mode). */
  function getParticipantAvatars(conv: Conversation): { userId: string; photoUrl?: string | null }[] {
    const parts = participantsByConv[conv.id] ?? [];
    const others = parts.filter((p) => p.user_id !== meId);
    const mode = conv.mode;
    return others.slice(0, 2).map((p) => {
      const u = usersById[p.user_id];
      const photoUrl =
        mode === "romance"
          ? (u?.romance_photos?.find((x) => !!x) ?? u?.main_photo_url ?? null)
          : mode === "friends"
            ? (u?.friends_photos?.find((x) => !!x) ?? u?.main_photo_url ?? null)
            : mode === "business"
              ? (u?.business_photos?.find((x) => !!x) ?? u?.main_photo_url ?? null)
              : (u?.main_photo_url ?? null);
      return { userId: p.user_id, photoUrl: photoUrl ?? null };
    });
  }

  const sortedItems = useMemo(
    () => sortChatInboxItems(items, lastMessageByConv, memberSettingsByConv),
    [items, lastMessageByConv, memberSettingsByConv]
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        <ChatsHeader mode={modeContext.active_mode ?? undefined} />
        <View style={styles.tabBar} />
        <View style={{ flex: 1, padding: 20, justifyContent: "center" }}>
          <ActivityIndicator />
          <Text style={{ textAlign: "center", marginTop: 8 }}>Loading chats…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* TOP HEADER — Filter (left) | Chats | Winkly AI (right) */}
      <ChatsHeader mode={modeContext.active_mode ?? undefined} />

      {/* SUBHEADER — same tab bar as Planner */}
      <View style={styles.tabBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContent}
          style={styles.tabBarScroll}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const bgColor = tab.key === "all" ? Colors.white : tab.secondary;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tab, { backgroundColor: bgColor }]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    { fontWeight: isActive ? "700" : "400" },
                    isActive && { color: tab.accent },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.contentArea}>
        <Button title="+ New chat" variant="secondary" onPress={goNewChat} style={styles.newChatBtn} />

      <FlatList
        style={{ flex: 1 }}
        data={sortedItems}
        keyExtractor={(c) => c.id}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => {
          const last = lastMessageByConv[item.id];
          const ts = last?.created_at ?? item.last_message_at ?? item.created_at;
          const settings = memberSettingsByConv[item.id];
          return (
            <ChatPreviewCard
              conversation={item}
              chatName={getConversationTitle(item)}
              lastMessage={last ?? null}
              participantAvatars={getParticipantAvatars(item)}
              timestamp={formatChatInboxTimestamp(ts)}
              unreadCount={unreadByConv[item.id] ?? 0}
              isPinned={settings?.pinned ?? false}
              onPress={() => router.push(`/chats/${item.id}`)}
              onAvatarPress={
                item.mode && item.mode !== "events"
                  ? (userId) => {
                      if (item.mode === "romance") router.push(`/(modes)/romance/profile-view?id=${userId}`);
                      else if (item.mode === "friends") router.push(`/(modes)/friends/profile-view?user_id=${userId}`);
                      else if (item.mode === "business") router.push(`/(modes)/business/profile-view?user_id=${userId}`);
                    }
                  : undefined
              }
            />
          );
        }}
        ListEmptyComponent={<Text style={{ opacity: 0.7, textAlign: "center" }}>There is no active chats yet. It&apos;s time to spark a conversation!</Text>}
      />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  tabBar: {
    backgroundColor: Colors.white,
    minHeight: 48,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  tabBarScroll: { flex: 1 },
  tabBarContent: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  contentArea: {
    flex: 1,
    padding: 20,
  },
  newChatBtn: {
    marginBottom: 12,
    borderColor: Colors.gray200,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    minHeight: 36,
  },
  tabLabel: {
    ...Typography.caption,
    fontSize: 13,
    color: Colors.textPrimary,
  },
});
