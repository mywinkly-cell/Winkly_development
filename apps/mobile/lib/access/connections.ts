/**
 * Winkly Connections — Follow / mutual connection
 * Friends Mode: mutual follow creates direct chat via DB trigger
 */

import { supabase } from "@/lib/supabase";

export async function followUser(followeeId: string) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { error } = await supabase.from("follows").insert({
    follower_id: uid,
    followee_id: followeeId,
  });
  if (error) throw error;
}

/** Friends discover / swipe — returns chat_id when mutual connection forms. */
export async function friendsFollowProfile(targetUserId: string): Promise<{
  followed: boolean;
  is_connection: boolean;
  chat_id?: string;
}> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { data, error } = await supabase.rpc("friends_follow_profile", {
    current_user_id: uid,
    target_user_id: targetUserId,
  });
  if (error) throw error;
  const row = data as { followed?: boolean; is_connection?: boolean; chat_id?: string };
  return {
    followed: !!row?.followed,
    is_connection: !!row?.is_connection,
    chat_id: row?.chat_id,
  };
}

export async function unfollowUser(followeeId: string) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", uid)
    .eq("followee_id", followeeId);
  if (error) throw error;
}
