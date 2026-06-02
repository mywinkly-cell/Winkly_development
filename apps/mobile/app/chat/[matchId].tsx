/**
 * Legacy route alias: `/chat/:id` → `/chats/:id`
 * `matchId` is the conversation id (not the matched user's id).
 */
import { Redirect, useLocalSearchParams } from "expo-router";

export default function ChatLegacyRedirect() {
  const { matchId } = useLocalSearchParams<{ matchId?: string }>();
  if (!matchId) return <Redirect href="/chats" />;
  return <Redirect href={`/chats/${matchId}`} />;
}
