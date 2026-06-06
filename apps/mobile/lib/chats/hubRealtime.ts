// apps/mobile/lib/chats/hubRealtime.ts
// Inbox hub postgres_changes — scoped channel names + stale cleanup so React
// Strict Mode / tab switches never call .on() after subscribe().

import { supabase } from "@/lib/supabase";

function removeHubChannels(prefix: string): void {
  const topicPrefix = `realtime:${prefix}`;
  for (const ch of supabase.getChannels()) {
    if (ch.topic === topicPrefix || ch.topic.startsWith(`${topicPrefix}:`)) {
      void supabase.removeChannel(ch);
    }
  }
}

/**
 * Subscribe to messages + conversations changes for the chats hub.
 * @param scopeKey disambiguates channels (e.g. active inbox tab).
 */
export function subscribeChatsHubUpdates(onChange: () => void, scopeKey: string): () => void {
  const channelName = `chats_hub_updates:${scopeKey}`;
  removeHubChannels("chats_hub_updates");

  const channel = supabase
    .channel(channelName)
    .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, onChange)
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
