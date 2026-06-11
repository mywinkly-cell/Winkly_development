// ────────────────────────────────────────────────
// ChatsInboxContent — Reusable inbox with mode-aware tab order
// Used inside Romance, Friends, Business mode screens
// ────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, FlatList, ActivityIndicator, StyleSheet, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
import type { AppMode, Conversation, ConversationMember, Message, UserMini } from "@/lib/chats";
import { getChatTabAccent } from "@/lib/chats/chatTabs";
import { useChatTabsWithModeFirst } from "@/lib/i18n/useChatTabs";
import { getDemoInboxPreview, shouldShowDemoInboxPreview, type DemoChatPreviewRow } from "@/lib/chats/demoInboxPreview";
import { subscribeChatsHubUpdates } from "@/lib/chats/hubRealtime";
import { appModeToHub, chatRoutes } from "@/lib/navigation/modeHub";
import { formatChatInboxTimestamp, loadChatInbox, sortChatInboxItems } from "@/lib/chats/inbox";
import { Colors, Layout } from "@/constants/tokens";
import { ChatModeTabBar } from "./ChatModeTabBar";
import { ChatPreviewCard } from "./ChatPreviewCard";
import { MatchesConnectionsSubheader, type MatchConnectionItem } from "./MatchesConnectionsSubheader";


type ChatsInboxContentProps = {
  sourceMode: "romance" | "friends" | "business" | "events" | "all";
};

export function ChatsInboxContent({ sourceMode }: ChatsInboxContentProps) {
  const chatHub = appModeToHub(sourceMode === "all" ? null : sourceMode);
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const tabs = useChatTabsWithModeFirst(sourceMode);
  const unknownLabel = t("chat.unknown");
  const initialTab: "all" | AppMode = sourceMode === "all" ? "all" : sourceMode;

  const [activeTab, setActiveTab] = useState<"all" | AppMode>(initialTab);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<Conversation[]>([]);
  const [, setError] = useState<string | null>(null);

  const [meId, setMeId] = useState<string | null>(null);
  const [participantsByConv, setParticipantsByConv] = useState<Record<string, ConversationMember[]>>({});
  const [usersById, setUsersById] = useState<Record<string, UserMini>>({});
  const [lastMessageByConv, setLastMessageByConv] = useState<Record<string, Message>>({});
  const [memberSettingsByConv, setMemberSettingsByConv] = useState<Record<string, { pinned: boolean; last_read_at: string | null }>>({});
  const [unreadByConv, setUnreadByConv] = useState<Record<string, number>>({});
  const [hasRomanceMatches, setHasRomanceMatches] = useState<boolean | null>(null);
  const [romanceMatchesList, setRomanceMatchesList] = useState<MatchConnectionItem[]>([]);
  const [romanceMatchesLoading, setRomanceMatchesLoading] = useState(false);
  const [friendsConnectionsList, setFriendsConnectionsList] = useState<MatchConnectionItem[]>([]);
  const [friendsConnectionsLoading, setFriendsConnectionsLoading] = useState(false);
  const [businessConnectionsList, setBusinessConnectionsList] = useState<MatchConnectionItem[]>([]);
  const [businessConnectionsLoading, setBusinessConnectionsLoading] = useState(false);
  const [hasFriendsConnections, setHasFriendsConnections] = useState<boolean | null>(null);
  const [hasBusinessConnections, setHasBusinessConnections] = useState<boolean | null>(null);
  const [myCity, setMyCity] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMeId(data.user?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    if (!meId) return;
    const lang = i18n?.language ?? "en";
    (async () => {
      const { data } = await supabase.from("user_profiles").select("city").eq("id", meId).maybeSingle();
      const raw = (data as { city?: string } | null)?.city ?? null;
      setMyCity(raw?.trim() ? normalizeLocationDisplayString(raw, lang) : null);
    })();
  }, [meId, i18n?.language]);

  const loadConversationsAndMeta = useCallback(async (options?: { refresh?: boolean }) => {
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
  }, [activeTab]);

  useEffect(() => {
    loadConversationsAndMeta();
  }, [loadConversationsAndMeta]);

  const loadRomanceMatches = useCallback(async () => {
    setRomanceMatchesLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.id) {
        setHasRomanceMatches(false);
        setRomanceMatchesList([]);
        return;
      }
      const [newRes, connRes] = await Promise.all([
        supabase.rpc("romance_new_matches", { current_user_id: userData.user.id }),
        supabase.rpc("romance_connections", { current_user_id: userData.user.id }),
      ]);
      const newMatches = (newRes.data ?? []) as Record<string, unknown>[];
      const connections = (connRes.data ?? []) as Record<string, unknown>[];
      const seen = new Set<string>();
      const list: MatchConnectionItem[] = [];
      for (const m of [...newMatches, ...connections]) {
        const id = m.id as string;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        list.push({
          id,
          first_name: (m.first_name as string) ?? null,
          last_name: (m.last_name as string) ?? null,
          city: (m.city as string) ?? null,
          romance_photos: (m.romance_photos as string[]) ?? [],
          core_photos: (m.core_photos as string[]) ?? [],
        });
      }
      setRomanceMatchesList(list);
      setHasRomanceMatches(list.length > 0);
    } catch {
      setHasRomanceMatches(null);
      setRomanceMatchesList([]);
    } finally {
      setRomanceMatchesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sourceMode === "romance" || sourceMode === "all") loadRomanceMatches();
  }, [sourceMode, loadRomanceMatches]);

  const loadFriendsConnections = useCallback(async () => {
    setFriendsConnectionsLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.id) {
        setFriendsConnectionsList([]);
        setHasFriendsConnections(false);
        return;
      }
      const me = userData.user.id;
      const [iFollowRes, followMeRes] = await Promise.all([
        supabase.from("follows").select("followee_id").eq("follower_id", me),
        supabase.from("follows").select("follower_id").eq("followee_id", me),
      ]);
      const iFollowIds = new Set((iFollowRes.data ?? []).map((r: { followee_id: string }) => r.followee_id));
      const mutualIds = (followMeRes.data ?? [])
        .map((r: { follower_id: string }) => r.follower_id)
        .filter((id: string) => iFollowIds.has(id));
      setHasFriendsConnections(mutualIds.length > 0);
      if (mutualIds.length === 0) {
        setFriendsConnectionsList([]);
        return;
      }
      const [profilesRes, friendProfilesRes] = await Promise.all([
        supabase.from("user_profiles").select("id,first_name,last_name,main_photo_url,city").in("id", mutualIds),
        supabase.from("friend_profiles").select("user_id,main_photo_url").in("user_id", mutualIds),
      ]);
      const profiles = profilesRes.data ?? [];
      const friendPhotoByUserId: Record<string, string | null> = {};
      for (const row of (friendProfilesRes.data ?? []) as { user_id: string; main_photo_url: string | null }[]) {
        const uid = row.user_id;
        friendPhotoByUserId[uid] = row.main_photo_url ?? null;
      }
      const list: MatchConnectionItem[] = profiles.map((p: Record<string, unknown>) => {
        const id = p.id as string;
        return {
          id,
          first_name: (p.first_name as string) ?? null,
          last_name: (p.last_name as string) ?? null,
          city: (p.city as string) ?? null,
          main_photo_url: (friendPhotoByUserId[id] ?? p.main_photo_url ?? null) as string | null,
        };
      });
      setFriendsConnectionsList(list);
    } catch {
      setFriendsConnectionsList([]);
      setHasFriendsConnections(null);
    } finally {
      setFriendsConnectionsLoading(false);
    }
  }, []);

  const loadBusinessConnections = useCallback(async () => {
    setBusinessConnectionsLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.id) {
        setBusinessConnectionsList([]);
        setHasBusinessConnections(false);
        return;
      }
      const me = userData.user.id;
      const [iFollowRes, followMeRes] = await Promise.all([
        supabase.from("follows").select("followee_id").eq("follower_id", me),
        supabase.from("follows").select("follower_id").eq("followee_id", me),
      ]);
      const iFollowIds = new Set((iFollowRes.data ?? []).map((r: { followee_id: string }) => r.followee_id));
      const mutualIds = (followMeRes.data ?? [])
        .map((r: { follower_id: string }) => r.follower_id)
        .filter((id: string) => iFollowIds.has(id));
      setHasBusinessConnections(mutualIds.length > 0);
      if (mutualIds.length === 0) {
        setBusinessConnectionsList([]);
        return;
      }
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id,first_name,last_name,main_photo_url,city")
        .in("id", mutualIds);
      const list: MatchConnectionItem[] = (profiles ?? []).map((p: Record<string, unknown>) => ({
        id: p.id as string,
        first_name: (p.first_name as string) ?? null,
        last_name: (p.last_name as string) ?? null,
        city: (p.city as string) ?? null,
        main_photo_url: (p.main_photo_url as string) ?? null,
      }));
      setBusinessConnectionsList(list);
    } catch {
      setBusinessConnectionsList([]);
      setHasBusinessConnections(null);
    } finally {
      setBusinessConnectionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sourceMode === "friends" || sourceMode === "all") loadFriendsConnections();
  }, [sourceMode, loadFriendsConnections]);

  useEffect(() => {
    if (sourceMode === "business" || sourceMode === "all") loadBusinessConnections();
  }, [sourceMode, loadBusinessConnections]);

  const refreshMatchesAndConversations = useCallback(() => {
    loadConversationsAndMeta();
    loadRomanceMatches();
    loadFriendsConnections();
    loadBusinessConnections();
  }, [loadConversationsAndMeta, loadRomanceMatches, loadFriendsConnections, loadBusinessConnections]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadConversationsAndMeta({ refresh: true });
    void loadRomanceMatches();
    void loadFriendsConnections();
    void loadBusinessConnections();
  }, [loadConversationsAndMeta, loadRomanceMatches, loadFriendsConnections, loadBusinessConnections]);

  useEffect(() => {
    return subscribeChatsHubUpdates(() => {
      void loadConversationsAndMeta();
    }, sourceMode);
  }, [loadConversationsAndMeta, sourceMode]);

  function formatName(u?: UserMini | null) {
    if (!u) return unknownLabel;
    const fn = (u.first_name ?? "").trim();
    const ln = (u.last_name ?? "").trim();
    const full = `${fn} ${ln}`.trim();
    return full || unknownLabel;
  }

  function getConversationTitle(conv: Conversation): string {
    if (conv.type === "dm") {
      const parts = participantsByConv[conv.id] ?? [];
      const otherId = parts.find((p) => p.user_id !== meId)?.user_id ?? null;
      return formatName(otherId ? usersById[otherId] : null);
    }
    if (conv.name) return conv.name;
    if (conv.type === "event") return t("chat.eventChat");
    return t("chat.groupChatTitle");
  }

  /** Avatar photo per participant: use mode-specific main photo (conversation mode) for consistency. */
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

  const useDemoPreview = shouldShowDemoInboxPreview(sortedItems.length);
  const demoRows = useMemo(
    () => (useDemoPreview ? getDemoInboxPreview(activeTab) : []),
    [useDemoPreview, activeTab]
  );

  const spinnerColor =
    sourceMode === "all" ? Colors.primaryViolet : Colors[sourceMode].primary;

  if (loading) {
    return (
      <View style={{ flex: 1, padding: 16, justifyContent: "center" }}>
        <ActivityIndicator size="large" color={spinnerColor} />
        <Text style={{ textAlign: "center", marginTop: 8 }}>{t("chat.loadingChats")}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* SUBHEADER — same tab bar as Planner; mode accent when opened from a mode hub */}
      {sourceMode !== "all" && (
        <View
          style={[
            styles.modeContextBar,
            { backgroundColor: getChatTabAccent(sourceMode) },
          ]}
          accessibilityLabel={`${sourceMode} chats`}
        />
      )}
      <ChatModeTabBar tabs={tabs} activeTab={activeTab} onTabPress={setActiveTab} />

      <MatchesConnectionsSubheader
        activeTab={activeTab}
        romanceMatches={romanceMatchesList}
        friendsConnections={friendsConnectionsList}
        businessConnections={businessConnectionsList}
        romanceLoading={romanceMatchesLoading}
        friendsLoading={friendsConnectionsLoading}
        businessLoading={businessConnectionsLoading}
        onRefresh={refreshMatchesAndConversations}
        myCity={myCity}
        chatHub={chatHub}
      />

      <View style={styles.contentArea}>
        {useDemoPreview ? (
          <FlatList<DemoChatPreviewRow>
            style={{ flex: 1 }}
            data={demoRows}
            keyExtractor={(row) => row.conversation.id}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={tabs.find((t) => t.key === activeTab)?.accent ?? Colors.primaryViolet}
              />
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
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={tabs.find((t) => t.key === activeTab)?.accent ?? Colors.primaryViolet}
              />
            }
            keyboardShouldPersistTaps="handled"
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
                  showModeContext
                  isPendingRomanceInvite={
                    item.type === "dm" &&
                    item.mode === "romance" &&
                    item.dm_source === "invite" &&
                    item.romance_invite_status === "pending"
                  }
                  onPress={() => {
                    if (item.type === "dm") {
                      const parts = participantsByConv[item.id] ?? [];
                      const otherId = parts.find((p) => p.user_id !== meId)?.user_id ?? null;
                      const peer = otherId ? usersById[otherId] : null;
                      const avatars = getParticipantAvatars(item);
                      router.push(
                        chatRoutes.conversation(chatHub, item.id, {
                          ...(otherId
                            ? {
                                partnerUserId: otherId,
                                partnerName: formatName(peer),
                                partnerPhotoUrl: avatars[0]?.photoUrl ?? "",
                              }
                            : {}),
                        }) as Parameters<typeof router.push>[0]
                      );
                    } else {
                      router.push(chatRoutes.conversation(chatHub, item.id) as Parameters<typeof router.push>[0]);
                    }
                  }}
                  onAvatarPress={
                    item.mode
                      ? (userId) => {
                          if (item.mode === "romance") router.push(`/(modes)/romance/profile-view?id=${userId}`);
                          else if (item.mode === "friends") router.push(`/(modes)/friends/profile-view?user_id=${userId}`);
                          else if (item.mode === "business") router.push(`/(modes)/business/profile-view?user_id=${userId}`);
                          else if (item.mode === "events") router.push(`/(modes)/events/profile-view?user_id=${userId}`);
                        }
                      : undefined
                  }
                />
              );
            }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {sourceMode === "romance"
                  ? hasRomanceMatches
                    ? "No active chats yet.\nIt's time to spark a conversation ✨"
                    : "No matches yet.\nDiscover people and let the spark happen"
                  : sourceMode === "friends"
                  ? hasFriendsConnections
                    ? "No active chats yet.\nIt's time to connect! ✨"
                    : "No matches yet.\nFind people who share your interests and vibe."
                  : sourceMode === "business"
                  ? hasBusinessConnections
                    ? "No active conversations yet.\nReach out and explore opportunities."
                    : "No professional connections yet.\nExpand your network and connect with the right people."
                  : "There is no active chats yet. It's time to spark a conversation!"}
              </Text>
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modeContextBar: {
    height: 3,
    width: "100%",
  },
  contentArea: {
    flex: 1,
  },
  emptyText: {
    opacity: 0.7,
    textAlign: "center",
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 24,
  },
});
