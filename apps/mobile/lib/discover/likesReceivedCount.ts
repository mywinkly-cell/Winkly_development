import { supabase } from "@/lib/supabase";

/** Count of romance likes received that are not yet matched (same source as Discover §1). */
export async function fetchRomanceLikesReceivedCount(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc("romance_likes_received", {
    current_user_id: userId,
  });
  if (error) return 0;
  return (data ?? []).length;
}

/** Count of followers the user has not followed back (Friends Discover §1). */
export async function fetchFriendsWantToConnectCount(userId: string): Promise<number> {
  const { data: followMe } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("followee_id", userId);
  const followerIds = (followMe ?? []).map((r: { follower_id: string }) => r.follower_id);
  if (followerIds.length === 0) return 0;

  const { data: iFollow } = await supabase
    .from("follows")
    .select("followee_id")
    .eq("follower_id", userId);
  const iFollowIds = new Set((iFollow ?? []).map((r: { followee_id: string }) => r.followee_id));
  return followerIds.filter((id: string) => !iFollowIds.has(id)).length;
}
