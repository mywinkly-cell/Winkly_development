import * as WebBrowser from "expo-web-browser";
import { supabase } from "@/lib/supabase";

export type VideoCallSession = {
  provider: string;
  room_url: string;
  token?: string | null;
  message?: string;
};

export async function startVideoCallForConversation(conversationId: string): Promise<VideoCallSession> {
  const { data, error } = await supabase.functions.invoke("video-call-session", {
    body: { conversation_id: conversationId },
  });
  if (error) throw error;
  return data as VideoCallSession;
}

export async function openVideoCallRoom(session: VideoCallSession): Promise<void> {
  await WebBrowser.openBrowserAsync(session.room_url);
}
