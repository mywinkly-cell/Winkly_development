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
