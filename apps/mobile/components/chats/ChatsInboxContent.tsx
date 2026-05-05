// ────────────────────────────────────────────────
// ChatsInboxContent — Reusable inbox with mode-aware tab order
// Used inside Romance, Friends, Business mode screens
// ────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
import type { AppMode, Conversation, ConversationMember, Message, UserMini } from "@/lib/chats";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { ChatPreviewCard } from "./ChatPreviewCard";
import { MatchesConnectionsSubheader, type MatchConnectionItem } from "./MatchesConnectionsSubheader";

type ChatTabKey = "all" | AppMode;

const CHAT_TAB_CONFIG: { key: ChatTabKey; label: string; secondary: string; accent: string }[] = [
  { key: "all", label: "All", secondary: Colors.white, accent: Colors.primaryViolet },
  { key: "romance", label: "Romance", secondary: Colors.romance.secondary, accent: Colors.romance.primary },
  { key: "friends", label: "Friends", secondary: Colors.friends.secondary, accent: Colors.friends.primary },
  { key: "business", label: "Business", secondary: Colors.business.secondary, accent: Colors.business.primary },
  { key: "events", label: "Events", secondary: Colors.events.secondary, accent: Colors.events.primary },
];

function getTabsWithModeFirst(sourceMode: "romance" | "friends" | "business" | "all"): typeof CHAT_TAB_CONFIG {
  if (sourceMode === "all") return CHAT_TAB_CONFIG;
  const modeTab = CHAT_TAB_CONFIG.find((t) => t.key === sourceMode)!;
  const rest = CHAT_TAB_CONFIG.filter((t) => t.key !== sourceMode && t.key !== "all");
  return [modeTab, CHAT_TAB_CONFIG.find((t) => t.key === "all")!, ...rest];
}

function formatName(u?: UserMini | null) {
  if (!u) return "Unknown";
  const fn = (u.first_name ?? "").trim();
  const ln = (u.last_name ?? "").trim();
  const full = `${fn} ${ln}`.trim();
  return full || "Unknown";
}

type ChatsInboxContentProps = {
  sourceMode: "romance" | "friends" | "business" | "all";
};

export function ChatsInboxContent({ sourceMode }: ChatsInboxContentProps) {
  const { i18n } = useTranslation();
  const router = useRouter();
  const tabs = useMemo(() => getTabsWithModeFirst(sourceMode), [sourceMode]);
  const initialTab: "all" | AppMode = sourceMode === "all" ? "all" : sourceMode;

  const [activeTab, setActiveTab] = useState<"all" | AppMode>(initialTab);
  const [loading, setLoading] = useState<boolean>(true);
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

  const loadConversationsAndMeta = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let q = supabase
        .from("conversations")
        .select("id,type,mode,name,last_message_at,archived,related_event_id")
        .eq("archived", false)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(200);

      if (activeTab !== "all") q = q.eq("mode", activeTab);

      const { data: convs, error: convErr } = await q;
      if (convErr) throw convErr;

      const conversations = (convs ?? []) as Conversation[];
      setItems(conversations);

      const convIds = conversations.map((c) => c.id);
      if (convIds.length === 0) {
        setParticipantsByConv({});
        setLastMessageByConv({});
        setUsersById({});
        setMemberSettingsByConv({});
        setUnreadByConv({});
        setLoading(false);
        return;
      }

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;

      const membersPromise = supabase
        .from("conversation_members")
        .select("conversation_id,user_id,role")
        .in("conversation_id", convIds)
        .is("left_at", null);

      const msgsPromise = supabase
        .from("messages")
        .select("id,conversation_id,sender_id,content,message_type,attachments,reply_to_id,edited_at,deleted_at,delete_type,status,created_at")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .limit(300);

      const settingsPromise = uid
        ? supabase
            .from("conversation_member_settings")
            .select("conversation_id,pinned,last_read_at")
            .in("conversation_id", convIds)
            .eq("user_id", uid)
        : Promise.resolve({ data: [] as { conversation_id: string; pinned: boolean; last_read_at: string | null }[], error: null });

      const unreadPromise = uid
        ? supabase.rpc("get_conversation_unread_counts", {
            p_conv_ids: convIds,
            p_user_id: uid,
          })
        : Promise.resolve({ data: [] as { conversation_id: string; unread_count: number }[], error: null });

      const [partsRes, msgsRes, settingsRes, unreadRes] = await Promise.all([
        membersPromise,
        msgsPromise,
        settingsPromise,
        unreadPromise,
      ]);

      if (partsRes.error) throw partsRes.error;
      if (msgsRes.error) throw msgsRes.error;
      if (settingsRes.error) throw settingsRes.error;
      if (unreadRes.error) throw unreadRes.error;

      const partsList = (partsRes.data ?? []) as ConversationMember[];
      const byConvParts: Record<string, ConversationMember[]> = {};
      for (const p of partsList) {
        byConvParts[p.conversation_id] = byConvParts[p.conversation_id] ?? [];
        byConvParts[p.conversation_id].push(p);
      }
      setParticipantsByConv(byConvParts);

      if (uid && settingsRes.data) {
        const byConv: Record<string, { pinned: boolean; last_read_at: string | null }> = {};
        for (const s of settingsRes.data as { conversation_id: string; pinned: boolean; last_read_at: string | null }[]) {
          byConv[s.conversation_id] = { pinned: s.pinned, last_read_at: s.last_read_at };
        }
        setMemberSettingsByConv(byConv);

        const unreadMap: Record<string, number> = {};
        for (const r of (unreadRes.data ?? []) as { conversation_id: string; unread_count: number }[]) {
          unreadMap[r.conversation_id] = Number(r.unread_count) || 0;
        }
        setUnreadByConv(unreadMap);
      } else {
        setMemberSettingsByConv({});
        setUnreadByConv({});
      }

      const userIds = Array.from(new Set(partsList.map((p) => p.user_id)));
      if (userIds.length > 0) {
        const [minisRes, modeProfilesRes] = await Promise.all([
          supabase.from("user_profiles").select("id,first_name,last_name,city,main_photo_url").in("id", userIds),
          supabase
            .from("profiles_mode")
            .select("user_id,mode,photos")
            .in("user_id", userIds)
            .in("mode", ["romance", "friends", "business"]),
        ]);

        if (minisRes.error) throw minisRes.error;
        if (modeProfilesRes.error) throw modeProfilesRes.error;

        const map: Record<string, UserMini> = {};
        for (const u of (minisRes.data ?? []) as UserMini[]) map[u.id] = { ...u };

        for (const row of (modeProfilesRes.data ?? []) as { user_id: string; mode: string; photos: (string | null)[] }[]) {
          const u = map[row.user_id];
          if (!u) continue;
          if (row.mode === "romance") u.romance_photos = row.photos ?? [];
          else if (row.mode === "friends") u.friends_photos = row.photos ?? [];
          else if (row.mode === "business") u.business_photos = row.photos ?? [];
        }
        setUsersById(map);
      } else {
        setUsersById({});
      }

      const lastMap: Record<string, Message> = {};
      for (const m of (msgsRes.data ?? []) as Message[]) {
        if (!lastMap[m.conversation_id]) lastMap[m.conversation_id] = m;
      }
      setLastMessageByConv(lastMap);
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

  useEffect(() => {
    const channel = supabase
      .channel("chats_hub_updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => loadConversationsAndMeta())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => loadConversationsAndMeta())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadConversationsAndMeta]);

  function getConversationTitle(conv: Conversation): string {
    if (conv.type === "dm") {
      const parts = participantsByConv[conv.id] ?? [];
      const otherId = parts.find((p) => p.user_id !== meId)?.user_id ?? null;
      return formatName(otherId ? usersById[otherId] : null);
    }
    if (conv.name) return conv.name;
    if (conv.type === "event") return "Event chat";
    return "Group chat";
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

  /** Chats ordered by last message sent (most recent first), same for All and every sub-tab. */
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const tsA = lastMessageByConv[a.id]?.created_at ?? a.last_message_at ?? a.created_at ?? "";
      const tsB = lastMessageByConv[b.id]?.created_at ?? b.last_message_at ?? b.created_at ?? "";
      return tsB.localeCompare(tsA);
    });
  }, [items, lastMessageByConv]);

  if (loading) {
    return (
      <View style={{ flex: 1, padding: 16, justifyContent: "center" }}>
        <ActivityIndicator />
        <Text style={{ textAlign: "center", marginTop: 8 }}>Loading chats…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* SUBHEADER — same tab bar as Planner */}
      <View style={styles.tabBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContent}
          style={styles.tabBarScroll}
        >
          {tabs.map((tab) => {
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
      />

      <View style={styles.contentArea}>
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
              timestamp={ts ? (() => {
                const d = new Date(ts);
                const now = new Date();
                const diffMs = now.getTime() - d.getTime();
                const diffMins = Math.floor(diffMs / 60000);
                const diffHours = Math.floor(diffMs / 3600000);
                const diffDays = Math.floor(diffMs / 86400000);
                if (diffMins < 1) return "Now";
                if (diffMins < 60) return `${diffMins}m`;
                if (diffHours < 24) return `${diffHours}h`;
                if (diffDays === 1) return "Yesterday";
                if (diffDays < 7) return `${diffDays}d`;
                return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
              })() : "—"}
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
        ListEmptyComponent={
          <Text style={{ opacity: 0.7, textAlign: "center" }}>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.white,
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  tabBarScroll: { flex: 1 },
  tabBarContent: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingHorizontal: 12,
  },
  contentArea: {
    flex: 1,
    padding: Layout.screenPadding,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    minHeight: 40,
  },
  tabLabel: {
    ...Typography.caption,
    fontSize: 14,
    fontWeight: "500",
    color: Colors.textPrimary,
  },
});
