import React, { useEffect, useMemo, useState } from "react";
import { View, Text, FlatList, ActivityIndicator, StyleSheet, RefreshControl } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";

import type { AppMode, Conversation, ConversationMember, Message, UserMini } from "@/lib/chats";
import { CHAT_TAB_CONFIG } from "@/lib/chats/chatTabs";
import { getDemoInboxPreview, shouldShowDemoInboxPreview, type DemoChatPreviewRow } from "@/lib/chats/demoInboxPreview";
import { subscribeChatsHubUpdates } from "@/lib/chats/hubRealtime";
import { formatChatInboxTimestamp, loadChatInbox, sortChatInboxItems } from "@/lib/chats/inbox";
import { ChatModeTabBar } from "@/components/chats/ChatModeTabBar";
import { ChatPreviewCard } from "@/components/chats/ChatPreviewCard";
import { ChatsHeader } from "@/components/layout/ChatsHeader";
import { Button } from "@/components/ui/Button";
import { Colors, Layout } from "@/constants/tokens";
import { useModeContext } from "@/providers";

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
  const [refreshing, setRefreshing] = useState(false);
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

  async function loadConversationsAndMeta(options?: { refresh?: boolean }) {
    const isRefresh = options?.refresh === true;
    if (!isRefresh) setLoading(true);
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
      if (!isRefresh) setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  }

  const onRefresh = () => {
    setRefreshing(true);
    void loadConversationsAndMeta({ refresh: true });
  };

  useEffect(() => {
    loadConversationsAndMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    return subscribeChatsHubUpdates(() => {
      void loadConversationsAndMeta();
    }, activeTab);
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

  const refreshTintColor = useMemo(() => {
    if (activeTab === "all") return Colors.primaryViolet;
    return CHAT_TAB_CONFIG.find((t) => t.key === activeTab)?.accent ?? Colors.primaryViolet;
  }, [activeTab]);

  const useDemoPreview = shouldShowDemoInboxPreview(sortedItems.length);
  const demoRows = useMemo(
    () => (useDemoPreview ? getDemoInboxPreview(activeTab) : []),
    [useDemoPreview, activeTab]
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        <ChatsHeader mode={modeContext.active_mode ?? undefined} />
        <ChatModeTabBar tabs={CHAT_TAB_CONFIG} activeTab="all" onTabPress={() => {}} />
        <View style={{ flex: 1, paddingHorizontal: Layout.screenPadding, justifyContent: "center" }}>
          <ActivityIndicator size="large" color={Colors.primaryViolet} />
          <Text style={{ textAlign: "center", marginTop: 8 }}>Loading chats…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* TOP HEADER — Filter (left) | Chats | Winkly AI (right) */}
      <ChatsHeader mode={modeContext.active_mode ?? undefined} />

      <ChatModeTabBar
        tabs={CHAT_TAB_CONFIG}
        activeTab={activeTab}
        onTabPress={setActiveTab}
      />

      <View style={styles.contentArea}>
        <Button title="+ New chat" variant="secondary" onPress={goNewChat} style={styles.newChatBtn} />
        {useDemoPreview ? (
          <FlatList<DemoChatPreviewRow>
            style={{ flex: 1 }}
            data={demoRows}
            keyExtractor={(row) => row.conversation.id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={refreshTintColor} />
            }
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <ChatPreviewCard
                conversation={item.conversation}
                chatName={item.chatName}
                lastMessage={null}
                lastMessagePreview={item.lastMessagePreview}
                participantAvatars={item.participantAvatars}
                timestamp={item.timestamp}
                unreadCount={item.unreadCount}
                isPinned={item.isPinned}
                isPendingRomanceInvite={item.isPendingRomanceInvite}
                isOnline={item.isOnline}
                showModeContext
                onPress={() => {}}
              />
            )}
          />
        ) : (
          <FlatList<Conversation>
            style={{ flex: 1 }}
            data={sortedItems}
            keyExtractor={(conv) => conv.id}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={refreshTintColor} />
            }
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: conv }) => {
              const last = lastMessageByConv[conv.id];
              const ts = last?.created_at ?? conv.last_message_at ?? conv.created_at;
              const settings = memberSettingsByConv[conv.id];
              return (
                <ChatPreviewCard
                  conversation={conv}
                  chatName={getConversationTitle(conv)}
                  lastMessage={last ?? null}
                  participantAvatars={getParticipantAvatars(conv)}
                  timestamp={formatChatInboxTimestamp(ts)}
                  unreadCount={unreadByConv[conv.id] ?? 0}
                  isPinned={settings?.pinned ?? false}
                  showModeContext
                  isPendingRomanceInvite={
                    conv.type === "dm" &&
                    conv.mode === "romance" &&
                    conv.dm_source === "invite" &&
                    conv.romance_invite_status === "pending"
                  }
                  onPress={() => router.push(`/chats/${conv.id}`)}
                  onAvatarPress={
                    conv.mode && conv.mode !== "events"
                      ? (userId) => {
                          if (conv.mode === "romance") router.push(`/(modes)/romance/profile-view?id=${userId}`);
                          else if (conv.mode === "friends") router.push(`/(modes)/friends/profile-view?user_id=${userId}`);
                          else if (conv.mode === "business") router.push(`/(modes)/business/profile-view?user_id=${userId}`);
                        }
                      : undefined
                  }
                />
              );
            }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                There is no active chats yet. It&apos;s time to spark a conversation!
              </Text>
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  contentArea: {
    flex: 1,
    paddingTop: Layout.screenPadding,
  },
  newChatBtn: {
    marginBottom: 12,
    marginHorizontal: Layout.screenPadding,
  },
  emptyText: {
    opacity: 0.7,
    textAlign: "center",
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 24,
  },
});
