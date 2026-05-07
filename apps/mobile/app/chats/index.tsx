import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";

import type { AppMode, Conversation, ConversationMember, Message, UserMini } from "@/lib/chats";
import { ChatPreviewCard } from "@/components/chats/ChatPreviewCard";
import { ChatsHeader } from "@/components/layout/ChatsHeader";
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
      // 1) conversations (RLS should ensure only participant conversations are returned)
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
    } catch (e: any) {
      setError(e?.message ?? "Failed to load chats.");
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

  function formatTimestamp(ts: string | null | undefined): string {
    if (!ts) return "—";
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
  }

  /** Chats ordered by last message sent (most recent first), for All and every sub-tab. */
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const tsA = lastMessageByConv[a.id]?.created_at ?? a.last_message_at ?? a.created_at ?? "";
      const tsB = lastMessageByConv[b.id]?.created_at ?? b.last_message_at ?? b.created_at ?? "";
      return tsB.localeCompare(tsA);
    });
  }, [items, lastMessageByConv]);

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
      <Pressable
        onPress={goNewChat}
        style={{
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderWidth: 1,
          borderRadius: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ fontWeight: "800" }}>+ New chat</Text>
      </Pressable>

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
              timestamp={formatTimestamp(ts)}
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
